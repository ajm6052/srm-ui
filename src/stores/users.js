import { defineStore } from 'pinia'
import { api } from '@utils/api'

export const useUsersStore = defineStore('users', {
  state: () => ({
    items: [],
    pagination: null,
    loading: false,
  }),
  actions: {
    // companyId narrows a platform operator's cross-company list to one company
    // (null = every company they may see); ignored for a normal company session.
    async fetch({ page = 1, pageSize = 25, companyId = null } = {}) {
      this.loading = true
      try {
        const res = await api.get('/api/users', { page, page_size: pageSize, company_id: companyId })
        this.items = res.data || []
        this.pagination = res.pagination || null
      } finally {
        this.loading = false
      }
    },
    create(payload) {
      return api.post('/api/users', payload)
    },
    update(id, payload) {
      return api.patch(`/api/users/${id}`, payload)
    },
    setPassword(id, password) {
      return api.patch(`/api/users/${id}/password`, { password })
    },

    // --- availability (working hours + time off) ---
    getAvailability(id) {
      return api.get(`/api/users/${id}/availability`)
    },
    setWorkingHours(id, windows) {
      return api.put(`/api/users/${id}/availability/hours`, { windows })
    },
    addTimeOff(id, payload) {
      return api.post(`/api/users/${id}/time-off`, payload)
    },
    removeTimeOff(id, offId) {
      return api.del(`/api/users/${id}/time-off/${offId}`)
    },
  },
})
