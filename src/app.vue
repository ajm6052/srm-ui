<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@stores/auth'
import NavBar from '@components/nav-bar.vue'
import AppSnackbar from '@components/app-snackbar.vue'

const route = useRoute()
const auth = useAuthStore()

// The app chrome (nav bar) shows once signed in, except on the auth screens.
const useChrome = computed(
  () => auth.loggedIn && !['login', 'register'].includes(route.name),
)
</script>

<template>
  <v-app>
    <nav-bar v-if="useChrome" />
    <v-main>
      <router-view v-if="auth.initialized" />
    </v-main>
    <app-snackbar />
  </v-app>
</template>

<style>
/* Global (unscoped) app polish. The Inter face + tighter smoothing give the whole
   app a crisper, more professional feel; the rest are small, safe refinements. */
.v-application {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Standard buttons get a soft radius; icon buttons stay perfectly circular. */
.v-btn:not(.v-btn--icon) {
  border-radius: 8px;
}

/* Headings a touch tighter — reads more polished than the default tracking. */
.text-h4,
.text-h5,
.text-h6 {
  letter-spacing: -0.015em !important;
}

/* Quieter, thinner scrollbars so dense tables/panels feel lighter. */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(15, 23, 42, 0.25) transparent;
}
*::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
*::-webkit-scrollbar-thumb {
  background: rgba(15, 23, 42, 0.2);
  border-radius: 8px;
  border: 2px solid transparent;
  background-clip: content-box;
}
*::-webkit-scrollbar-thumb:hover {
  background: rgba(15, 23, 42, 0.35);
  background-clip: content-box;
}
</style>
