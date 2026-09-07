import { defineStore } from 'pinia'
import { api } from '@utils/api'

export const useTeamsStore = defineStore('teams', {
  state: () => ({
    items: [],
    loading: false,
  }),
  actions: {
    async fetch() {
      this.loading = true
      try {
        const { data } = await api.get('/api/teams')
        this.items = data || []
      } finally {
        this.loading = false
      }
    },
    get(id) {
      return api.get(`/api/teams/${id}`)
    },
    create(payload) {
      return api.post('/api/teams', payload)
    },
    update(id, payload) {
      return api.patch(`/api/teams/${id}`, payload)
    },
    remove(id) {
      return api.del(`/api/teams/${id}`)
    },
    addMember(id, userId) {
      return api.post(`/api/teams/${id}/members`, { user_id: userId })
    },
    removeMember(id, userId) {
      return api.del(`/api/teams/${id}/members/${userId}`)
    },
  },
})
