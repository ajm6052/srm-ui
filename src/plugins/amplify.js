// AWS Cognito authentication via Amplify. The frontend owns login: it exchanges
// email+password for Cognito tokens and sends the ID TOKEN to the API (the
// backend's JWKS verifier reads the `email` claim to resolve the app account).
//
// Everything Amplify is confined to this module so the rest of the app never
// imports `aws-amplify` directly. All of it is inert unless VITE_AUTH_MODE is
// 'cognito'; in dev the API runs with AUTH_DISABLED (the bearer is the email).
import { Amplify } from 'aws-amplify'
import { signIn, confirmSignIn, signOut, fetchAuthSession } from 'aws-amplify/auth'

export const AUTH_MODE = import.meta.env.VITE_AUTH_MODE || 'dev'
export const isCognito = AUTH_MODE === 'cognito'

// configureAmplify wires Amplify to the user pool from build-time env. Idempotent
// and a no-op outside cognito mode. Returns whether Cognito is active.
export function configureAmplify() {
  if (!isCognito) return false
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
        userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID,
        loginWith: { email: true },
      },
    },
  })
  return true
}

// cognitoSignIn exchanges email + password for a Cognito session. Returns 'DONE'
// when signed in, or 'NEW_PASSWORD_REQUIRED' when the account was created with a
// temporary password and must set a new one (the force-change flow). Any other
// challenge (MFA, etc.) throws a stable code so the caller can show a message.
export async function cognitoSignIn(email, password) {
  const { isSignedIn, nextStep } = await signIn({ username: email, password })
  if (isSignedIn) return 'DONE'
  if (nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') return 'NEW_PASSWORD_REQUIRED'
  throw new Error(`cognito_next_step:${nextStep?.signInStep || 'UNKNOWN'}`)
}

// cognitoConfirmNewPassword completes the NEW_PASSWORD_REQUIRED challenge with the
// password the user just chose (Amplify holds the pending challenge from the prior
// signIn). Returns 'DONE' when the session is established.
export async function cognitoConfirmNewPassword(newPassword) {
  const { isSignedIn, nextStep } = await confirmSignIn({ challengeResponse: newPassword })
  if (isSignedIn) return 'DONE'
  throw new Error(`cognito_next_step:${nextStep?.signInStep || 'UNKNOWN'}`)
}

export async function cognitoSignOut() {
  try {
    await signOut()
  } catch {
    /* signing out is best-effort */
  }
}

// cognitoIdToken returns a fresh ID token, or '' when there is no session.
// fetchAuthSession transparently refreshes an expired ID token using the stored
// refresh token, so calling this before every request keeps the header valid.
export async function cognitoIdToken() {
  try {
    const session = await fetchAuthSession()
    return session.tokens?.idToken?.toString() || ''
  } catch {
    return ''
  }
}

// cognitoHasSession reports whether a valid session exists (used on boot to decide
// whether to load /me or show the login screen).
export async function cognitoHasSession() {
  try {
    const session = await fetchAuthSession()
    return !!session.tokens?.idToken
  } catch {
    return false
  }
}
