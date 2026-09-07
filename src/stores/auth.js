import { defineStore } from 'pinia'
import { api, setToken, getToken } from '@utils/api'

// Authentication state for SRM. The token is ours: login/register/switch return a
// signed JWT for one company, which we persist (via utils/api) and attach to
// every request. Because one account can belong to several companies, the store
// also tracks the account's `memberships` (its workspaces) so the app can show a
// picker at login and a switcher in the nav.
export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    company: null,
    permissions: [],
    memberships: [],
    // Whether startup has finished checking for an existing session.
    initialized: false,
  }),
  getters: {
    loggedIn: (state) => !!state.user,
    // Platform staff (support or superadmin) can reach the /admin panel.
    isPlatformStaff: (state) => !!state.user?.is_platform_staff,
    // Alias of "is staff", used by the admin route/nav gate.
    isPlatformAdmin: (state) => !!state.user?.is_platform_admin,
    isSuperAdmin: (state) => !!state.user?.is_super_admin,
    role: (state) => state.user?.role || '',
    hasCompany: (state) => !!state.company,
    activeCompanyId: (state) => state.company?.id || null,
    hasMultipleWorkspaces: (state) => (state.memberships?.length || 0) > 1,
    // can(permission) — gate company UI controls the way the API gates routes. A
    // superadmin can do anything; support gets no company permissions (its reach
    // is the admin tools, not the company screens).
    can: (state) => (permission) =>
      state.isSuperAdmin || state.permissions.includes(permission),
    // The Permissions reference is for the roles meant to understand access
    // control: a company owner, or platform staff (support / superadmin). Mirrors
    // the backend's RequireOwnerOrStaff gate.
    canViewPermissions: (state) => state.role === 'owner' || state.isPlatformStaff,
    // Where to land after login / bounce a permission failure: the schedule for
    // company users, the admin panel for platform-only staff.
    homeRoute: (state) => (state.company ? { name: 'schedule' } : { name: 'admin' }),
  },
  actions: {
    // Apply a login/register/switch result: persist the token and hydrate state.
    _apply(result) {
      setToken(result.token)
      this.user = result.user
      this.company = result.user?.company || null
      this.permissions = result.permissions || []
      if (result.memberships) this.memberships = result.memberships
    },

    async logIn({ email, password }) {
      // Email is globally unique, so it alone identifies the account (and its
      // companies) — no company field at sign-in.
      const result = await api.post('/auth/login', { email, password })
      this._apply(result)
      return result
    },

    async register(payload) {
      const result = await api.post('/auth/register', payload)
      this._apply(result)
      return result
    },

    // Switch the active company to another workspace the account belongs to. The
    // current token authorizes the switch; the response carries a new token
    // scoped to the chosen company.
    async switchCompany(companyId) {
      const result = await api.post('/api/switch', { company_id: companyId })
      this._apply(result)
      return result
    },

    // Update the active company's profile (name and/or IANA time zone) and reflect
    // the result in local state so the nav chip and schedule pick it up at once.
    async updateCompanySettings({ name, timezone }) {
      const company = await api.patch('/api/company', { name, timezone })
      this.company = company
      const m = this.memberships.find((x) => x.company_id === company.id)
      if (m) m.company_name = company.name
      return company
    },

    // --- account recovery ---

    // Change the signed-in account's own password (requires the current one).
    changePassword(currentPassword, newPassword) {
      return api.post('/api/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
    },

    // Request a reset link for an email. Always resolves (the API never reveals
    // whether the email exists), so the UI shows the same confirmation regardless.
    requestPasswordReset(email) {
      return api.post('/auth/forgot-password', { email })
    },

    // Redeem a reset token with a new password.
    resetPassword(token, newPassword) {
      return api.post('/auth/reset-password', { token, new_password: newPassword })
    },

    // Rehydrate from a stored token on app start / hard refresh.
    async restoreSession() {
      if (!getToken()) {
        this.initialized = true
        return
      }
      try {
        const { user, permissions, memberships } = await api.get('/api/me')
        this.user = user
        this.company = user?.company || null
        this.permissions = permissions || []
        this.memberships = memberships || []
      } catch {
        this.logOut()
      } finally {
        this.initialized = true
      }
    },

    logOut() {
      setToken('')
      this.user = null
      this.company = null
      this.permissions = []
      this.memberships = []
    },
  },
})
