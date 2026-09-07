import { defineStore } from 'pinia'

// A tiny global snackbar queue. Stores and views push success/error notices
// here; app-snackbar.vue renders the current one. Errors (e.g. a 409
// double-booking) stay a beat longer so the user can read which job conflicted.
export const useMessagesStore = defineStore('messages', {
  state: () => ({
    open: false,
    text: '',
    color: 'success',
    timeout: 4000,
  }),
  actions: {
    notify(text, color = 'success', timeout = 4000) {
      this.text = text
      this.color = color
      this.timeout = timeout
      this.open = true
    },
    success(text) {
      this.notify(text, 'success', 3500)
    },
    error(text) {
      this.notify(text, 'error', 6000)
    },
  },
})
