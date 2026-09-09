import { defineStore } from 'pinia'
import { api } from '@utils/api'

// Company analytics for a date window.
export const useReportsStore = defineStore('reports', {
  state: () => ({
    data: null,
    loading: false,
  }),
  actions: {
    // companyId narrows a platform operator's cross-company report to one company
    // (null = every company they may see); ignored for a normal company session.
    async fetch({ from = '', to = '', companyId = null } = {}) {
      this.loading = true
      try {
        this.data = await api.get('/api/reports/overview', { from, to, company_id: companyId })
      } finally {
        this.loading = false
      }
    },
  },
})
