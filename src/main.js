import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './app.vue'
import router from '@router'
import vuetify from './plugins/vuetify'
import { i18n } from '@i18n'
import { useAuthStore } from '@stores/auth'
import { useConfigStore } from '@stores/config'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(i18n)
app.use(vuetify)

// Restore any existing session BEFORE installing the router, so the router's very
// first navigation (e.g. a hard refresh straight onto /teams) already sees the
// signed-in user and its permissions. Installing the router earlier would run the
// auth guard against a not-yet-restored session, bouncing deep links through the
// login screen. Guarded so a failed/absent session still mounts (at login).
// Also load public runtime config (e.g. whether sign-up is offered) so the login
// page renders correctly on first paint. Both are best-effort — a failure still
// mounts the app (at login).
Promise.allSettled([useAuthStore(pinia).restoreSession(), useConfigStore(pinia).fetch()]).finally(
  () => {
    app.use(router)
    app.mount('#app')
  },
)
