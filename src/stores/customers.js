import { defineStore } from 'pinia'
import { api } from '@utils/api'

// Customers and their service sites. Jobs are scheduled for a customer (and
// optionally one of its sites), so the schedule and the job dialog read from here.
export const useCustomersStore = defineStore('customers', {
  state: () => ({
    items: [],
    loading: false,
  }),
  actions: {
    async fetch() {
      this.loading = true
      try {
        const res = await api.get('/api/customers')
        this.items = res.data || []
      } finally {
        this.loading = false
      }
    },
    create(payload) {
      return api.post('/api/customers', payload)
    },
    update(id, payload) {
      return api.patch(`/api/customers/${id}`, payload)
    },
    remove(id) {
      return api.del(`/api/customers/${id}`)
    },
    addSite(customerId, payload) {
      return api.post(`/api/customers/${customerId}/sites`, payload)
    },
    updateSite(customerId, siteId, payload) {
      return api.patch(`/api/customers/${customerId}/sites/${siteId}`, payload)
    },
    removeSite(customerId, siteId) {
      return api.del(`/api/customers/${customerId}/sites/${siteId}`)
    },
  },
})
