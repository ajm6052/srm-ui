import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Amplify auth surface so we can drive cognitoSignIn's control flow
// without a real user pool. aws-amplify itself is mocked to keep the heavy SDK
// (and its top-level import) out of the test.
const signIn = vi.fn()
const signOut = vi.fn()
const confirmSignIn = vi.fn()
const fetchAuthSession = vi.fn()

vi.mock('aws-amplify', () => ({ Amplify: { configure: vi.fn() } }))
vi.mock('aws-amplify/auth', () => ({
  signIn: (...a) => signIn(...a),
  signOut: (...a) => signOut(...a),
  confirmSignIn: (...a) => confirmSignIn(...a),
  fetchAuthSession: (...a) => fetchAuthSession(...a),
}))

// Imported after the mocks are registered.
const { cognitoSignIn } = await import('../src/plugins/amplify.js')

describe('cognitoSignIn', () => {
  beforeEach(() => {
    signIn.mockReset()
    signOut.mockReset()
  })

  it("returns 'DONE' on a clean sign-in without touching signOut", async () => {
    signIn.mockResolvedValueOnce({ isSignedIn: true })
    await expect(cognitoSignIn('a@srm.com', 'pw')).resolves.toBe('DONE')
    expect(signIn).toHaveBeenCalledTimes(1)
    expect(signOut).not.toHaveBeenCalled()
  })

  it("maps the force-change challenge to 'NEW_PASSWORD_REQUIRED'", async () => {
    signIn.mockResolvedValueOnce({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
    })
    await expect(cognitoSignIn('a@srm.com', 'pw')).resolves.toBe('NEW_PASSWORD_REQUIRED')
  })

  it('clears a lingering session and retries when signIn reports one already signed in', async () => {
    signIn
      .mockRejectedValueOnce({ name: 'UserAlreadyAuthenticatedException' })
      .mockResolvedValueOnce({ isSignedIn: true })
    await expect(cognitoSignIn('a@srm.com', 'pw')).resolves.toBe('DONE')
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(signIn).toHaveBeenCalledTimes(2)
  })

  it('rethrows a real sign-in failure (e.g. wrong password) without signing out', async () => {
    signIn.mockRejectedValueOnce({ name: 'NotAuthorizedException', message: 'Incorrect username or password.' })
    await expect(cognitoSignIn('a@srm.com', 'bad')).rejects.toMatchObject({ name: 'NotAuthorizedException' })
    expect(signOut).not.toHaveBeenCalled()
    expect(signIn).toHaveBeenCalledTimes(1)
  })
})
