import { defineStore } from 'pinia'
import { api } from '@utils/api'

// Public runtime config the SPA reads before login — sourced from the API's
// /config so the UI never drifts from the server's actual policy. Today it only
// carries whether self-service sign-up is offered; the API is the hard gate
// (POST /auth/register returns 403 when disabled), this just hides the link.
export const useConfigStore = defineStore('config', {
  state: () => ({
    // Optimistic default, corrected by fetch() at startup. If the API is
    // unreachable at boot the link may show and the server still enforces policy.
    registrationEnabled: true,
    loaded: false,
  }),
  actions: {
    async fetch() {
      try {
        const cfg = await api.get('/config')
        this.registrationEnabled = cfg.registration_enabled !== false
      } catch {
        // keep the optimistic default
      } finally {
        this.loaded = true
      }
    },
  },
})
