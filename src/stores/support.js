import { defineStore } from 'pinia'
import { api } from '@utils/api'

// Company-facing support desk: the caller's own bug reports and requests.
export const useSupportStore = defineStore('support', {
  state: () => ({
    items: [],
    pagination: null,
    loading: false,
  }),
  actions: {
    async fetch(filter = {}, { page = 1, pageSize = 25 } = {}) {
      this.loading = true
      try {
        const res = await api.get('/api/support-tickets', { ...filter, page, page_size: pageSize })
        this.items = res.data || []
        this.pagination = res.pagination || null
      } finally {
        this.loading = false
      }
    },
    get(id) {
      return api.get(`/api/support-tickets/${id}`)
    },
    create(payload) {
      return api.post('/api/support-tickets', payload)
    },
    addComment(id, body) {
      return api.post(`/api/support-tickets/${id}/comments`, { body })
    },
  },
})
