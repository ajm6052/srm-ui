import { defineStore } from 'pinia'
import { api, streamSSE } from '@utils/api'

// Live SSE handle, kept module-level (not in reactive state) since it's an opaque
// stop() function, not data. One stream per signed-in session.
let stopStream = null

// The signed-in user's in-app notifications (bell menu + unread badge).
export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    items: [],
    unread: 0,
  }),
  actions: {
    async fetch() {
      const res = await api.get('/api/notifications')
      this.items = res.data || []
      this.unread = res.unread || 0
    },
    async fetchUnread() {
      const res = await api.get('/api/notifications/unread-count')
      this.unread = res.unread || 0
    },
    async markRead(id) {
      const n = this.items.find((x) => x.id === id)
      if (!n || n.read_at) return
      await api.post(`/api/notifications/${id}/read`)
      n.read_at = new Date().toISOString()
      this.unread = Math.max(0, this.unread - 1)
    },
    async markAllRead() {
      if (!this.unread && !this.items.some((n) => !n.read_at)) return
      await api.post('/api/notifications/read-all')
      const now = new Date().toISOString()
      this.items.forEach((n) => {
        if (!n.read_at) n.read_at = now
      })
      this.unread = 0
    },
    // Open the live SSE stream so new notifications arrive instantly. Idempotent —
    // a second call while already connected is a no-op.
    connectStream() {
      if (stopStream) return
      stopStream = streamSSE('/api/notifications/stream', {
        onMessage: ({ event, data }) => {
          if (event === 'notification' && data && typeof data === 'object') {
            this.receive(data)
          }
        },
      })
    },
    disconnectStream() {
      if (stopStream) {
        stopStream()
        stopStream = null
      }
    },
    // Apply one pushed notification: prepend it and bump the unread badge. Guards
    // against a duplicate id (e.g. one already loaded by a concurrent fetch).
    receive(n) {
      if (this.items.some((x) => x.id === n.id)) return
      this.items.unshift(n)
      if (!n.read_at) this.unread += 1
    },
    reset() {
      this.disconnectStream()
      this.items = []
      this.unread = 0
    },
  },
})
