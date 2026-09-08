<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'
import { useMessagesStore } from '@stores/messages'
import { useNotificationsStore } from '@stores/notifications'
import ChangePasswordDialog from '@components/change-password-dialog.vue'
import CompanySettingsDialog from '@components/company-settings-dialog.vue'
import LanguageToggle from '@components/language-toggle.vue'

const auth = useAuthStore()
const router = useRouter()
const { t } = useI18n({ useScope: 'global' })
const messages = useMessagesStore()
const notifications = useNotificationsStore()

const passwordDialog = ref(false)
const companyDialog = ref(false)

// Notifications: a company session has an inbox; platform-only staff don't.
const showBell = computed(() => auth.loggedIn && auth.hasCompany)
let unreadTimer = null
onMounted(() => {
  if (!showBell.value) return
  // Initial state, then live updates over SSE (new notifications arrive instantly).
  notifications.fetch().catch(() => {})
  notifications.connectStream()
  // Slow safety poll in case streaming is unavailable (e.g. a proxy strips SSE) —
  // reconciles the badge against the authoritative count every few minutes.
  unreadTimer = setInterval(() => notifications.fetchUnread().catch(() => {}), 180000)
})
onUnmounted(() => {
  if (unreadTimer) clearInterval(unreadTimer)
  notifications.disconnectStream()
})
// Load the full list when the bell menu opens.
function onBellToggle(open) {
  if (open) notifications.fetch().catch(() => {})
}
function openNotification(n) {
  notifications.markRead(n.id).catch(() => {})
}
function notifyWhen(iso) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Switch the active workspace. A full reload onto the schedule reslates every
// cached store (teams, jobs, …) for the new company — clean and race-free, and
// switching is a rare, deliberate action.
const switching = ref(false)
async function switchTo(companyId) {
  if (companyId === auth.activeCompanyId || switching.value) return
  switching.value = true
  try {
    await auth.switchCompany(companyId)
    window.location.assign('/schedule')
  } catch (err) {
    messages.error(err.message || t('toast.genericError'))
    switching.value = false
  }
}

// Nav destinations, each gated by a permission (or the admin flag). Only the
// ones the signed-in user can actually use are shown — the same rules the API
// enforces, so a link never leads to a 403.
const links = computed(() =>
  [
    // Platform staff see the schedule too — as the read-only cross-company board.
    { label: 'nav.schedule', to: { name: 'schedule' }, icon: '$schedule', show: auth.can('jobs:view') || auth.isPlatformStaff },
    { label: 'nav.teams', to: { name: 'teams' }, icon: '$teams', show: auth.can('teams:view') },
    { label: 'nav.users', to: { name: 'users' }, icon: '$users', show: auth.can('users:view') },
    { label: 'nav.customers', to: { name: 'customers' }, icon: '$company', show: auth.can('customers:view') },
    { label: 'nav.reports', to: { name: 'reports' }, icon: '$reports', show: auth.can('reports:view') },
    // The per-company support desk is for a company to reach the platform team.
    // Platform staff ARE that team — they triage every company's tickets in the
    // Admin → Support tab — and belong to the internal company, which files none,
    // so the desk would only ever look empty for them. Hide it for staff.
    { label: 'nav.support', to: { name: 'support' }, icon: '$support', show: auth.can('support:create') && !auth.isPlatformStaff },
    { label: 'nav.permissions', to: { name: 'permissions' }, icon: '$permissions', show: auth.canViewPermissions },
    { label: 'nav.admin', to: { name: 'admin' }, icon: '$admin', show: auth.isPlatformAdmin },
  ].filter((l) => l.show),
)

function logOut() {
  notifications.reset()
  auth.logOut()
  router.push({ name: 'login' })
}
</script>

<template>
  <v-app-bar color="surface" density="comfortable" flat border class="px-2">
    <!-- Three balanced regions: left (brand) and right (controls) each take equal
         flex, so the center nav is truly centered in the bar regardless of how
         wide either side is. -->
    <div class="bar-region bar-left">
      <router-link :to="auth.homeRoute" class="brand-link d-flex align-center" :aria-label="$t('nav.goHome')">
        <div class="brand-mark">S</div>
        <span class="brand-word">SRM</span>
      </router-link>
    </div>

    <nav class="bar-center">
      <v-btn
        v-for="link in links"
        :key="link.label"
        :to="link.to"
        :prepend-icon="link.icon"
        variant="text"
        class="nav-link"
      >
        {{ $t(link.label) }}
      </v-btn>
    </nav>

    <div class="bar-region bar-right">
      <!-- Notifications bell (company sessions). -->
    <v-menu v-if="showBell" :close-on-content-click="false" location="bottom end" @update:model-value="onBellToggle">
      <template #activator="{ props }">
        <v-btn icon v-bind="props" class="mr-1">
          <v-badge
            :content="notifications.unread"
            :model-value="notifications.unread > 0"
            color="error"
            max="99"
          >
            <v-icon icon="$bell" />
          </v-badge>
        </v-btn>
      </template>
      <v-card min-width="340" max-width="400" rounded="lg">
        <v-card-title class="d-flex align-center text-subtitle-2 pa-3">
          {{ $t('notifications.title') }}
          <v-spacer />
          <v-btn
            v-if="notifications.unread"
            size="x-small"
            variant="text"
            @click="notifications.markAllRead()"
          >
            {{ $t('notifications.markAllRead') }}
          </v-btn>
        </v-card-title>
        <v-divider />
        <v-list v-if="notifications.items.length" density="compact" max-height="380" class="overflow-y-auto py-0">
          <v-list-item
            v-for="n in notifications.items"
            :key="n.id"
            :class="{ 'notif-unread': !n.read_at }"
            @click="openNotification(n)"
          >
            <v-list-item-title class="text-body-2 font-weight-medium">{{ n.title }}</v-list-item-title>
            <v-list-item-subtitle>{{ n.body }}</v-list-item-subtitle>
            <div class="text-caption text-medium-emphasis">{{ notifyWhen(n.created_at) }}</div>
          </v-list-item>
        </v-list>
        <v-card-text v-else class="text-medium-emphasis text-center py-6">
          {{ $t('notifications.empty') }}
        </v-card-text>
      </v-card>
    </v-menu>

    <!-- Multi-workspace account: a switcher. Single-company: a static chip. -->
    <v-menu v-if="auth.hasMultipleWorkspaces">
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          variant="tonal"
          color="primary"
          size="small"
          class="mr-2 d-none d-sm-flex text-none ws-flex"
          prepend-icon="$company"
          append-icon="$menu"
          :loading="switching"
        >
          {{ auth.company?.name }}
        </v-btn>
      </template>
      <v-list min-width="240" density="comfortable">
        <v-list-subheader>{{ $t('nav.switchWorkspace') }}</v-list-subheader>
        <v-list-item
          v-for="m in auth.memberships"
          :key="m.company_id"
          :active="m.company_id === auth.activeCompanyId"
          :title="m.company_name"
          :subtitle="$t('roles.' + m.role)"
          @click="switchTo(m.company_id)"
        >
          <template #prepend><v-icon icon="$company" /></template>
          <template #append>
            <v-icon v-if="m.company_id === auth.activeCompanyId" icon="$completed" color="success" size="small" />
          </template>
        </v-list-item>
      </v-list>
    </v-menu>

    <v-chip v-else-if="auth.company" variant="tonal" color="secondary" class="mr-2 d-none d-sm-flex ws-flex" size="small">
      <v-icon icon="$company" start size="small" />{{ auth.company.name }}
    </v-chip>

    <!-- Platform-only staff have no company: badge their platform role instead. -->
    <v-chip
      v-else-if="auth.isPlatformStaff"
      variant="tonal"
      :color="auth.isSuperAdmin ? 'primary' : 'secondary'"
      class="mr-2 d-none d-sm-flex text-capitalize ws-flex"
      size="small"
    >
      <v-icon icon="$admin" start size="small" />{{ auth.isSuperAdmin ? $t('nav.superadmin') : $t('nav.supportStaff') }}
    </v-chip>

    <language-toggle class="mr-2 d-none d-sm-flex" />

    <v-menu>
      <template #activator="{ props }">
        <v-btn icon="$account" v-bind="props" />
      </template>
      <v-list min-width="220" density="comfortable">
        <v-list-item :title="auth.user?.name" :subtitle="auth.user?.email">
          <template #prepend><v-icon icon="$account" /></template>
        </v-list-item>
        <v-list-item v-if="auth.role" :subtitle="$t('common.role') + ': ' + $t('roles.' + auth.role)" />
        <v-divider />
        <!-- When the centered bar nav is hidden (narrower screens), the links live
             in the menu instead. -->
        <template v-for="link in links" :key="'m-' + link.label">
          <v-list-item :to="link.to" :title="$t(link.label)" class="nav-menu-only">
            <template #prepend><v-icon :icon="link.icon" /></template>
          </v-list-item>
        </template>
        <div class="d-flex justify-center py-2 d-sm-none">
          <language-toggle />
        </div>
        <v-divider class="nav-menu-only" />
        <v-list-item v-if="auth.can('company:manage')" :title="$t('nav.companySettings')" @click="companyDialog = true">
          <template #prepend><v-icon icon="$company" /></template>
        </v-list-item>
        <v-list-item :title="$t('nav.changePassword')" @click="passwordDialog = true">
          <template #prepend><v-icon icon="$key" /></template>
        </v-list-item>
        <v-list-item :title="$t('common.signOut')" @click="logOut">
          <template #prepend><v-icon icon="$logout" /></template>
        </v-list-item>
      </v-list>
      </v-menu>
    </div>
  </v-app-bar>

  <!-- Kept out of <v-app-bar> so the overlay mounts cleanly when toggled from the menu. -->
  <change-password-dialog v-model="passwordDialog" />
  <company-settings-dialog v-model="companyDialog" />
</template>

<style scoped>
/* Three-region app bar: the two sides grow equally (flex: 1) so the center nav
   group stays centered in the bar no matter how wide either side is. */
.bar-region {
  display: flex;
  align-items: center;
  flex: 1 1 0;
  min-width: 0;
}
.bar-left {
  justify-content: flex-start;
}
.bar-right {
  justify-content: flex-end;
}
.bar-center {
  align-items: center;
  flex: 0 0 auto;
  /* Hidden by default; only shown on screens wide enough to fit a centered
     7-item nav without crushing the controls (see media query below). */
  display: none;
}

/* Right-hand controls keep their natural size; only the workspace chip gives up
   width (and ellipsizes) when space is tight, so the bell, language toggle, and
   account button are never crushed. */
.bar-right > * {
  flex-shrink: 0;
}
.bar-right > .ws-flex {
  flex-shrink: 1;
  min-width: 0;
}

/* The centered top nav is a wide, 7-item row. Show it only where there's room to
   center it cleanly; on narrower screens the links live in the account menu
   instead (nav-menu-only), which keeps the right-hand controls intact. */
@media (min-width: 1400px) {
  .bar-center {
    display: flex;
  }
  .nav-menu-only {
    display: none !important;
  }
}

/* Brand lockup: an indigo tile + wordmark, reading like a real product logo,
   and a link back to the user's home. */
.brand-link {
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  width: fit-content;
}
.brand-mark {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgb(var(--v-theme-primary));
  color: #fff;
  font-weight: 700;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: -0.02em;
}
.brand-word {
  margin-left: 10px;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: -0.02em;
  color: rgb(var(--v-theme-on-surface));
}

/* Nav links: muted by default, full-strength primary when active. */
.nav-link {
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-weight: 500;
  letter-spacing: normal;
}
/* Tighter than the default button padding so an 8-item nav stays compact and
   keeps breathing room on both sides once centered (see the .bar-* regions). */
.bar-center .nav-link {
  margin: 0 1px;
  padding-inline: 10px;
}
.bar-center .nav-link :deep(.v-btn__prepend) {
  margin-inline: -2px 6px;
}
.nav-link.v-btn--active {
  color: rgb(var(--v-theme-primary));
}

/* Unread notifications get a faint primary wash. */
.notif-unread {
  background: rgba(var(--v-theme-primary), 0.06);
}
</style>
