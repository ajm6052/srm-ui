import { defineStore } from 'pinia'
import { api } from '@utils/api'

// Platform admin panel: cross-company overview, company management, and support
// triage. Every call here hits an /admin route the backend gates behind the
// platform-admin flag.
export const useAdminStore = defineStore('admin', {
  state: () => ({
    overview: null,
    companies: [],
    companiesPagination: null,
    tickets: [],
    ticketsPagination: null,
    loading: false,
  }),
  actions: {
    async fetchOverview() {
      this.overview = await api.get('/admin/overview')
    },
    async fetchCompanies({ page = 1, pageSize = 25 } = {}) {
      const res = await api.get('/admin/companies', { page, page_size: pageSize })
      this.companies = res.data || []
      this.companiesPagination = res.pagination || null
    },
    async fetchTickets(filter = {}, { page = 1, pageSize = 25 } = {}) {
      this.loading = true
      try {
        const res = await api.get('/admin/support-tickets', { ...filter, page, page_size: pageSize })
        this.tickets = res.data || []
        this.ticketsPagination = res.pagination || null
      } finally {
        this.loading = false
      }
    },
    getTicket(id) {
      return api.get(`/admin/support-tickets/${id}`)
    },
    triage(id, payload) {
      return api.patch(`/admin/support-tickets/${id}`, payload)
    },
    addComment(id, body) {
      return api.post(`/admin/support-tickets/${id}/comments`, { body })
    },
    setCompanyStatus(id, status) {
      return api.patch(`/admin/companies/${id}/status`, { status })
    },

    // --- one company (admin tools) ---
    getCompany(cid) {
      return api.get(`/admin/companies/${cid}`)
    },
    // Users
    companyUsers(cid, params = {}) {
      return api.get(`/admin/companies/${cid}/users`, params)
    },
    createCompanyUser(cid, payload) {
      return api.post(`/admin/companies/${cid}/users`, payload)
    },
    updateCompanyUser(cid, uid, payload) {
      return api.patch(`/admin/companies/${cid}/users/${uid}`, payload)
    },
    setCompanyUserPassword(cid, uid, password) {
      return api.patch(`/admin/companies/${cid}/users/${uid}/password`, { password })
    },
    // Teams
    companyTeams(cid) {
      return api.get(`/admin/companies/${cid}/teams`)
    },
    getCompanyTeam(cid, tid) {
      return api.get(`/admin/companies/${cid}/teams/${tid}`)
    },
    createCompanyTeam(cid, payload) {
      return api.post(`/admin/companies/${cid}/teams`, payload)
    },
    updateCompanyTeam(cid, tid, payload) {
      return api.patch(`/admin/companies/${cid}/teams/${tid}`, payload)
    },
    deleteCompanyTeam(cid, tid) {
      return api.del(`/admin/companies/${cid}/teams/${tid}`)
    },
    addCompanyTeamMember(cid, tid, userId) {
      return api.post(`/admin/companies/${cid}/teams/${tid}/members`, { user_id: userId })
    },
    removeCompanyTeamMember(cid, tid, userId) {
      return api.del(`/admin/companies/${cid}/teams/${tid}/members/${userId}`)
    },
    // Jobs
    companyJobs(cid, params) {
      return api.get(`/admin/companies/${cid}/jobs`, params)
    },
    createCompanyJob(cid, payload) {
      return api.post(`/admin/companies/${cid}/jobs`, payload)
    },
    updateCompanyJob(cid, jid, payload) {
      return api.patch(`/admin/companies/${cid}/jobs/${jid}`, payload)
    },
    setCompanyJobStatus(cid, jid, status) {
      return api.patch(`/admin/companies/${cid}/jobs/${jid}/status`, { status })
    },
    deleteCompanyJob(cid, jid) {
      return api.del(`/admin/companies/${cid}/jobs/${jid}`)
    },

    // --- platform staff (superadmin) ---
    listStaff() {
      return api.get('/admin/staff')
    },
    grantSupport(email) {
      return api.post('/admin/staff', { email })
    },
    revokeStaff(accountId) {
      return api.del(`/admin/staff/${accountId}`)
    },
    // Replace a support agent's company assignments — these ARE the agent's
    // access ([] = access to no companies).
    setStaffCompanies(accountId, companyIds) {
      return api.put(`/admin/staff/${accountId}/companies`, { company_ids: companyIds })
    },

    // --- audit (superadmin) ---
    listAudit(params = {}) {
      return api.get('/admin/audit', params)
    },
  },
})
