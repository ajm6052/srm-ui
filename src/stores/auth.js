import { defineStore } from 'pinia'
import { api, setToken, getToken, setActiveCompany } from '@utils/api'
import {
  isCognito,
  cognitoSignIn,
  cognitoConfirmNewPassword,
  cognitoSignOut,
  cognitoHasSession,
} from '../plugins/amplify'

// Authentication state for SRM. Sign-in is owned by AWS Cognito (via Amplify) on
// the frontend; the API only verifies the Cognito ID token and never issues one.
// Because one account can belong to several companies, the store tracks the
// account's `memberships` (its workspaces) and the active company — sent to the
// API as the X-Company-Id header (see @utils/api). In dev mode (VITE_AUTH_MODE
// != 'cognito') the API runs with AUTH_DISABLED and the bearer is just the email.
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
    isPlatformStaff: (state) => !!state.user?.is_platform_staff,
    isPlatformAdmin: (state) => !!state.user?.is_platform_admin,
    isSuperAdmin: (state) => !!state.user?.is_super_admin,
    role: (state) => state.user?.role || '',
    hasCompany: (state) => !!state.company,
    // A platform-staff session with no company selected sees Teams/Users/Customers/
    // Reports as read-only CROSS-COMPANY views: a superadmin spans every company, a
    // support agent only its assigned ones (the API enforces the actual reach).
    crossCompany: (state) => !!state.user?.is_platform_staff && !state.company,
    activeCompanyId: (state) => state.company?.id || null,
    hasMultipleWorkspaces: (state) => (state.memberships?.length || 0) > 1,
    can: (state) => (permission) => state.isSuperAdmin || state.permissions.includes(permission),
    canViewPermissions: (state) => state.role === 'owner' || state.isPlatformStaff,
    homeRoute: (state) => (state.company ? { name: 'schedule' } : { name: 'admin' }),
  },
  actions: {
    // hydrate loads /api/me and applies the current session. The API resolves the
    // membership from the X-Company-Id header; if none is set yet and the account
    // has exactly one workspace, we select it and reload /me so the session lands
    // in a company instead of a company-less state.
    async hydrate() {
      let me = await api.get('/api/me')
      if (!me.user?.company && (me.memberships?.length || 0) === 1) {
        setActiveCompany(me.memberships[0].company_id)
        me = await api.get('/api/me')
      }
      this.user = me.user
      this.company = me.user?.company || null
      this.permissions = me.permissions || []
      this.memberships = me.memberships || []
    },

    // logIn establishes a session. In Cognito mode it signs in via Amplify and may
    // return 'NEW_PASSWORD_REQUIRED' (the caller then collects a new password and
    // calls confirmNewPassword). In dev mode the email is stored as the bearer. On
    // 'DONE' the session is hydrated from /me.
    async logIn({ email, password }) {
      if (isCognito) {
        const step = await cognitoSignIn(email, password)
        if (step === 'NEW_PASSWORD_REQUIRED') return step
      } else {
        setToken(email.trim().toLowerCase())
      }
      await this.hydrate()
      return 'DONE'
    },

    // confirmNewPassword completes the Cognito force-change challenge, then hydrates.
    async confirmNewPassword(newPassword) {
      await cognitoConfirmNewPassword(newPassword)
      await this.hydrate()
      return 'DONE'
    },

    // switchCompany changes the active workspace. Selecting the company sets the
    // X-Company-Id header; a full reload onto the schedule reslates every cached
    // store (teams, jobs, …) for the new company — clean and race-free.
    async switchCompany(companyId) {
      if (companyId === this.activeCompanyId) return
      setActiveCompany(companyId)
      window.location.assign('/schedule')
    },

    // updateCompanySettings updates the active company's profile (name / IANA time
    // zone) and reflects it locally so the nav chip and schedule pick it up at once.
    async updateCompanySettings({ name, timezone }) {
      const company = await api.patch('/api/company', { name, timezone })
      this.company = company
      const m = this.memberships.find((x) => x.company_id === company.id)
      if (m) m.company_name = company.name
      return company
    },

    // restoreSession rehydrates from an existing Cognito session (or dev token) on
    // app start / hard refresh. A missing session leaves the app at the login screen.
    async restoreSession() {
      const hasSession = isCognito ? await cognitoHasSession() : !!getToken()
      if (!hasSession) {
        this.initialized = true
        return
      }
      try {
        await this.hydrate()
      } catch {
        this.logOut()
      } finally {
        this.initialized = true
      }
    },

    async logOut() {
      if (isCognito) await cognitoSignOut()
      setToken('')
      setActiveCompany('')
      this.user = null
      this.company = null
      this.permissions = []
      this.memberships = []
    },
  },
})
