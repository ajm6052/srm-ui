import { defineStore } from 'pinia'
import { api } from '@utils/api'

// Company analytics for a date window.
export const useReportsStore = defineStore('reports', {
  state: () => ({
    data: null,
    loading: false,
  }),
  actions: {
    async fetch({ from = '', to = '' } = {}) {
      this.loading = true
      try {
        this.data = await api.get('/api/reports/overview', { from, to })
      } finally {
        this.loading = false
      }
    },
  },
})
