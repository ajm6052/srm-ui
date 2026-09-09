import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './app.vue'
import router from '@router'
import vuetify from './plugins/vuetify'
import { i18n } from '@i18n'
import { useAuthStore } from '@stores/auth'
import { configureAmplify, cognitoIdToken } from './plugins/amplify'
import { setTokenProvider } from '@utils/api'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(i18n)
app.use(vuetify)

// Configure Cognito (a no-op in dev mode) and, when active, have the API client
// pull a fresh Cognito ID token — refreshed by Amplify — for every request.
if (configureAmplify()) setTokenProvider(cognitoIdToken)

// Restore any existing session BEFORE installing the router, so the router's very
// first navigation (e.g. a hard refresh straight onto /teams) already sees the
// signed-in user and its permissions. Installing the router earlier would run the
// auth guard against a not-yet-restored session, bouncing deep links through the
// login screen. Guarded so a failed/absent session still mounts (at login).
// Best-effort — a failed/absent session still mounts the app (at login).
useAuthStore(pinia)
  .restoreSession()
  .finally(() => {
    app.use(router)
    app.mount('#app')
  })
