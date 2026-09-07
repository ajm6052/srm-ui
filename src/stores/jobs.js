import { defineStore } from 'pinia'
import { api, getToken, BASE_URL } from '@utils/api'

// The schedule. Jobs are always loaded for a single day (the day view), so the
// store tracks the selected date and the jobs within it. Writes surface the
// backend's double-booking 409 straight to the caller so the view can show it.
export const useJobsStore = defineStore('jobs', {
  state: () => ({
    items: [],
    loading: false,
  }),
  actions: {
    // Load the jobs whose start falls on `date` (a YYYY-MM-DD string).
    fetchForDay(date, teamId = '') {
      const next = new Date(date + 'T00:00:00')
      next.setDate(next.getDate() + 1)
      return this.fetchRange(date, next.toISOString().slice(0, 10), teamId)
    },

    // Load jobs whose start falls in [from, to) — both YYYY-MM-DD, `to`
    // exclusive. Backs both the single-day board (a 1-day range) and the week
    // view (a 7-day range).
    async fetchRange(from, to, teamId = '') {
      this.loading = true
      try {
        const { data } = await api.get('/api/jobs', { from, to, team_id: teamId || '' })
        this.items = data || []
      } finally {
        this.loading = false
      }
    },
    create(payload) {
      return api.post('/api/jobs', payload)
    },
    update(id, payload) {
      return api.patch(`/api/jobs/${id}`, payload)
    },
    setStatus(id, status) {
      return api.patch(`/api/jobs/${id}/status`, { status })
    },
    remove(id) {
      return api.del(`/api/jobs/${id}`)
    },
    // Job records: comments + activity history.
    timeline(id) {
      return api.get(`/api/jobs/${id}/timeline`)
    },
    addComment(id, body) {
      return api.post(`/api/jobs/${id}/comments`, { body })
    },

    // Photo attachments. Upload (multipart) and download (blob) bypass the JSON
    // api helper but reuse its base URL + bearer token.
    listAttachments(id) {
      return api.get(`/api/jobs/${id}/attachments`)
    },
    async uploadAttachment(id, file) {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${BASE_URL}/api/jobs/${id}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || 'Upload failed')
      }
      return res.json()
    },
    async attachmentObjectUrl(id, attId) {
      const res = await fetch(`${BASE_URL}/api/jobs/${id}/attachments/${attId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) throw new Error('Could not load image')
      return URL.createObjectURL(await res.blob())
    },
    removeAttachment(id, attId) {
      return api.del(`/api/jobs/${id}/attachments/${attId}`)
    },
  },
})
