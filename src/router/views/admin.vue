<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminStore } from '@stores/admin'
import { useMessagesStore } from '@stores/messages'
import { useAuthStore } from '@stores/auth'

const admin = useAdminStore()
const messages = useMessagesStore()
const auth = useAuthStore()
const { t } = useI18n({ useScope: 'global' })

const tab = ref('overview')
const refreshing = ref(false)

// Pagination. Companies and support load in 100-row windows so the in-tab
// search/filter keeps working over the current window (and the server never
// returns an unbounded list); the audit log pages 25 at a time.
const COMPANY_PAGE_SIZE = 100
const TICKET_PAGE_SIZE = 100
const AUDIT_PAGE_SIZE = 25
const companiesPage = ref(1)
const ticketsPage = ref(1)
const auditPage = ref(1)
const auditPagination = ref(null)

const STATUSES = computed(() => [
  { value: 'open', title: t('support.statuses.open') },
  { value: 'in_progress', title: t('support.statuses.in_progress') },
  { value: 'resolved', title: t('support.statuses.resolved') },
  { value: 'closed', title: t('support.statuses.closed') },
])
const TYPES = computed(() => [
  { value: 'bug', title: t('support.types.bug') },
  { value: 'request', title: t('support.types.request') },
  { value: 'question', title: t('support.types.question') },
  { value: 'other', title: t('support.types.other') },
])
const PRIORITIES = computed(() => [
  { value: 'low', title: t('support.priorities.low') },
  { value: 'medium', title: t('support.priorities.medium') },
  { value: 'high', title: t('support.priorities.high') },
  { value: 'urgent', title: t('support.priorities.urgent') },
])

// One categorical mapping, reused everywhere (chips and bars), so the panel reads
// as one system. Chips take the Vuetify color name; bars take the matching hex.
const typeColor = { bug: 'red', request: 'indigo', question: 'teal', other: 'blue-grey' }
const statusColor = { open: 'primary', in_progress: 'info', resolved: 'success', closed: 'grey' }
const priorityColor = { low: 'blue-grey', medium: 'primary', high: 'orange', urgent: 'red' }

// Validated categorical palette (dataviz skill, light mode), assigned to each
// ticket type/status in a FIXED order so a category's colour never shifts.
const VIZ = { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a', yellow: '#eda100' }
const TYPE_ORDER = ['bug', 'request', 'question', 'other']
const TYPE_VIZ = { bug: VIZ.blue, request: VIZ.orange, question: VIZ.aqua, other: VIZ.yellow }
const TYPE_LABEL = computed(() => ({
  bug: t('support.types.bug'),
  request: t('support.types.request'),
  question: t('support.types.question'),
  other: t('support.types.other'),
}))
const STATUS_ORDER = ['open', 'in_progress', 'resolved', 'closed']
const STATUS_VIZ = { open: VIZ.blue, in_progress: VIZ.orange, resolved: VIZ.aqua, closed: VIZ.yellow }
const STATUS_LABEL = computed(() => ({
  open: t('support.statuses.open'),
  in_progress: t('support.statuses.in_progress'),
  resolved: t('support.statuses.resolved'),
  closed: t('support.statuses.closed'),
}))

onMounted(load)

async function load() {
  try {
    await Promise.all([
      admin.fetchOverview(),
      loadCompanies(),
      applyFilters(),
      loadStaff(),
      loadAudit(),
    ])
  } catch (err) {
    messages.error(err.message)
  }
}

function loadCompanies() {
  return admin.fetchCompanies({ page: companiesPage.value, pageSize: COMPANY_PAGE_SIZE })
}
async function refresh() {
  refreshing.value = true
  try {
    await load()
  } finally {
    refreshing.value = false
  }
}

// ─── Overview ────────────────────────────────────────────────────────────────
// Only tiles with a real destination are clickable; the rest carry a "this week"
// delta (or today's load) so they inform at a glance instead of being dead cards.
const tiles = computed(() => {
  const o = admin.overview || {}
  return [
    { key: 'companies', label: t('admin.tiles.companies'), value: o.companies, icon: '$company', color: 'primary', delta: deltaWeek(o.new_companies_week), deltaUp: (o.new_companies_week || 0) > 0, to: () => (tab.value = 'companies') },
    { key: 'users', label: t('admin.tiles.users'), value: o.users, icon: '$users', color: 'primary', delta: deltaWeek(o.new_users_week), deltaUp: (o.new_users_week || 0) > 0 },
    { key: 'teams', label: t('admin.tiles.teams'), value: o.teams, icon: '$teams', color: 'primary' },
    { key: 'jobs', label: t('admin.tiles.jobs'), value: o.jobs, icon: '$job', color: 'primary', delta: t('admin.jobsToday', { n: o.jobs_today || 0 }) },
    { key: 'upcoming', label: t('admin.tiles.upcoming'), value: o.upcoming_jobs, icon: '$scheduled', color: 'primary', delta: deltaWeek(o.new_jobs_week), deltaUp: (o.new_jobs_week || 0) > 0 },
    { key: 'support', label: t('admin.tiles.support'), value: o.open_support, icon: '$support', color: 'warning', to: () => openSupport({}) },
  ]
})

// "This week" delta text (companies/users/jobs created in the last 7 days).
function deltaWeek(n) {
  n = n || 0
  return n > 0 ? t('admin.newThisWeek', { n }) : t('admin.noNewThisWeek')
}
// Compact relative time for the queue / activity / company panels.
function ago(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return t('admin.ago.justNow')
  const m = Math.floor(s / 60)
  if (m < 60) return t('admin.ago.minutes', { n: m })
  const h = Math.floor(m / 60)
  if (h < 24) return t('admin.ago.hours', { n: h })
  return t('admin.ago.days', { n: Math.floor(h / 24) })
}
const recentOpen = computed(() => admin.overview?.recent_open_support || [])
const recentCompanies = computed(() => admin.overview?.recent_companies || [])
const recentAudit = computed(() => admin.overview?.recent_audit || [])

// composition turns a { key: count } map into part-to-whole segments (share of
// total), for a 100%-stacked bar + legend. Colour is fixed per category; the
// legend carries the count and share so identity is never colour-alone.
function composition(map, order, colors, labels) {
  const m = map || {}
  const total = Object.values(m).reduce((a, b) => a + b, 0)
  const segments = order
    .filter((k) => m[k])
    .map((k) => ({
      key: k,
      label: labels[k] || k,
      count: m[k],
      pct: total ? Math.round((m[k] / total) * 100) : 0,
      color: colors[k],
    }))
  return { total, segments }
}
const typeComp = computed(() =>
  composition(admin.overview?.support_by_type, TYPE_ORDER, TYPE_VIZ, TYPE_LABEL.value),
)
const statusComp = computed(() =>
  composition(admin.overview?.support_by_status, STATUS_ORDER, STATUS_VIZ, STATUS_LABEL.value),
)

// ─── Companies ───────────────────────────────────────────────────────────────
const companySearch = ref('')
const companyStatusFilter = ref(null)
const filteredCompanies = computed(() => {
  const q = companySearch.value.trim().toLowerCase()
  return admin.companies.filter((c) => {
    if (companyStatusFilter.value && c.status !== companyStatusFilter.value) return false
    if (!q) return true
    return c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
  })
})

async function toggleCompany(company) {
  const next = company.status === 'active' ? 'suspended' : 'active'
  try {
    await admin.setCompanyStatus(company.id, next)
    messages.success(
      next === 'active'
        ? t('admin.companyReactivated', { name: company.name })
        : t('admin.companySuspended', { name: company.name }),
    )
    await Promise.all([loadCompanies(), admin.fetchOverview()])
  } catch (err) {
    messages.error(err.message)
  }
}

// ─── Staff (superadmin) ──────────────────────────────────────────────────────
const staff = ref([])
const platformRoleColor = { support: 'primary', superadmin: 'deep-purple' }

async function loadStaff() {
  if (!auth.isSuperAdmin) return
  try {
    const { data } = await admin.listStaff()
    staff.value = data || []
  } catch (err) {
    messages.error(err.message)
  }
}

// Add a support agent — name + email, and optionally scope them to companies in
// the same step. A new email creates the account; an existing one is promoted.
const addDialog = ref(false)
const addForm = ref({ name: '', email: '', companies: [] })
const addingStaff = ref(false)
function openAddStaff() {
  addForm.value = { name: '', email: '', companies: [] }
  addDialog.value = true
}
async function addStaff() {
  const name = addForm.value.name.trim()
  const email = addForm.value.email.trim()
  if (!email) return
  addingStaff.value = true
  try {
    const account = await admin.addSupport(name, email)
    if (addForm.value.companies.length) {
      await admin.setStaffCompanies(account.id, addForm.value.companies)
    }
    messages.success(t('admin.staffAdded', { email }))
    addDialog.value = false
    await loadStaff()
  } catch (err) {
    if (err.status === 400) messages.error(t('admin.staffNeedsName'))
    else if (err.status === 409) messages.error(t('admin.staffEmailInUse'))
    else if (err.status === 403) messages.error(t('admin.cantChangeAccount'))
    else messages.error(err.message)
  } finally {
    addingStaff.value = false
  }
}
async function revokeStaff(account) {
  try {
    await admin.revokeStaff(account.id)
    messages.success(t('admin.revoked', { email: account.email }))
    await loadStaff()
  } catch (err) {
    messages.error(err.status === 403 ? t('admin.cantRevoke') : err.message)
  }
}

// Company-access assignment (scope a support agent to specific companies).
const assignDialog = ref(false)
const assignTarget = ref(null)
const assignSelected = ref([])
const assignSaving = ref(false)
const companyItems = computed(() => admin.companies.map((c) => ({ value: c.id, title: c.name })))
function openAssign(s) {
  assignTarget.value = s
  assignSelected.value = (s.companies || []).map((c) => c.id)
  assignDialog.value = true
}
async function saveAssign() {
  assignSaving.value = true
  try {
    await admin.setStaffCompanies(assignTarget.value.id, assignSelected.value)
    messages.success(t('admin.accessUpdated'))
    assignDialog.value = false
    await loadStaff()
  } catch (err) {
    messages.error(err.message || t('admin.couldNotUpdate'))
  } finally {
    assignSaving.value = false
  }
}

// ─── Audit (superadmin) ──────────────────────────────────────────────────────
const audit = ref([])
async function loadAudit() {
  if (!auth.isSuperAdmin) return
  try {
    const res = await admin.listAudit({ page: auditPage.value, pageSize: AUDIT_PAGE_SIZE })
    audit.value = res.data || []
    auditPagination.value = res.pagination || null
  } catch (err) {
    messages.error(err.message)
  }
}
function auditWhen(iso) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const auditActionColor = {
  'admin.write': 'blue-grey',
  'company.status': 'orange',
  'staff.grant': 'success',
  'staff.revoke': 'error',
}

// ─── Support ─────────────────────────────────────────────────────────────────
const filters = ref({ company_id: '', status: '', type: '', priority: '' })
const ticketSearch = ref('')

async function applyFilters() {
  await admin.fetchTickets({ ...filters.value }, { page: ticketsPage.value, pageSize: TICKET_PAGE_SIZE })
}
// Changing a filter resets to the first page, then refetches.
function onFilterChange() {
  ticketsPage.value = 1
  applyFilters()
}
// Jump into the Support tab with a preset filter (drill-down from tiles/bars/companies).
async function openSupport(preset) {
  filters.value = { company_id: '', status: '', type: '', priority: '', ...preset }
  ticketSearch.value = ''
  ticketsPage.value = 1
  tab.value = 'support'
  await applyFilters()
}
function clearFilters() {
  filters.value = { company_id: '', status: '', type: '', priority: '' }
  ticketSearch.value = ''
  ticketsPage.value = 1
  applyFilters()
}
const hasActiveFilters = computed(
  () => ticketSearch.value.trim() !== '' || Object.values(filters.value).some((v) => v !== ''),
)
const companyOptions = computed(() =>
  admin.companies.map((c) => ({ value: c.id, title: c.name })),
)
const filteredTickets = computed(() => {
  const q = ticketSearch.value.trim().toLowerCase()
  if (!q) return admin.tickets
  return admin.tickets.filter(
    (t) =>
      t.reference.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      (t.company?.name || '').toLowerCase().includes(q),
  )
})

// ─── Triage detail ───────────────────────────────────────────────────────────
const detailDialog = ref(false)
const ticket = ref(null)
const reply = ref('')
async function open(row) {
  ticket.value = await admin.getTicket(row.id)
  reply.value = ''
  detailDialog.value = true
}
async function triage(field, value) {
  try {
    ticket.value = await admin.triage(ticket.value.id, { [field]: value })
    await Promise.all([applyFilters(), admin.fetchOverview()])
  } catch (err) {
    messages.error(err.message)
  }
}
async function sendReply() {
  if (!reply.value.trim()) return
  try {
    ticket.value = await admin.addComment(ticket.value.id, reply.value.trim())
    reply.value = ''
  } catch (err) {
    messages.error(err.message)
  }
}
function fmt(iso) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const supportHeaders = computed(() => [
  { title: t('admin.colReference'), key: 'reference', width: 130 },
  { title: t('admin.colCompany'), key: 'company' },
  { title: t('admin.colSubject'), key: 'subject' },
  { title: t('admin.colType'), key: 'type' },
  { title: t('admin.colPriority'), key: 'priority' },
  { title: t('admin.colStatus'), key: 'status' },
])
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <div class="d-flex align-center mb-2">
      <v-icon icon="$admin" size="large" color="deep-purple" class="mr-2" />
      <h1 class="text-h5 font-weight-bold">{{ $t('admin.panelTitle') }}</h1>
      <v-spacer />
      <v-btn icon="$refresh" variant="text" :loading="refreshing" @click="refresh" />
    </div>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="overview" prepend-icon="$dashboard">{{ $t('admin.tabs.overview') }}</v-tab>
      <v-tab value="companies" prepend-icon="$company">
        {{ $t('admin.tabs.companies') }}
        <v-chip size="x-small" class="ml-2" variant="tonal">{{ admin.companiesPagination?.total ?? admin.companies.length }}</v-chip>
      </v-tab>
      <v-tab value="support" prepend-icon="$support">
        {{ $t('admin.tabs.support') }}
        <v-chip v-if="admin.overview" size="x-small" class="ml-2" color="orange" variant="tonal">
          {{ admin.overview.open_support }}
        </v-chip>
      </v-tab>
      <v-tab v-if="auth.isSuperAdmin" value="staff" prepend-icon="$account">
        {{ $t('admin.tabs.staff') }}
        <v-chip size="x-small" class="ml-2" variant="tonal">{{ staff.length }}</v-chip>
      </v-tab>
      <v-tab v-if="auth.isSuperAdmin" value="audit" prepend-icon="$history">{{ $t('admin.tabs.audit') }}</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- ══════════════ OVERVIEW ══════════════ -->
      <v-window-item value="overview">
        <v-row>
          <v-col v-for="t in tiles" :key="t.key" cols="6" sm="4" md="2">
            <v-card
              rounded="lg"
              variant="outlined"
              :class="['pa-4', 'stat-tile', 'h-100', { 'stat-clickable': t.to }]"
              @click="t.to && t.to()"
            >
              <div class="d-flex align-center">
                <v-avatar :color="t.color" variant="tonal" size="42" rounded="lg" class="mr-3">
                  <v-icon :icon="t.icon" size="22" />
                </v-avatar>
                <div class="flex-grow-1" style="min-width: 0">
                  <div class="stat-value">{{ t.value ?? '—' }}</div>
                  <div class="stat-label">{{ t.label }}</div>
                  <!-- Always rendered (blank when there's no delta) so every tile is
                       the same height and the row reads as one even grid. -->
                  <div
                    class="stat-delta"
                    :class="t.deltaUp ? 'text-success' : 'text-medium-emphasis'"
                  >
                    {{ t.delta || ' ' }}
                  </div>
                </div>
                <v-icon v-if="t.to" icon="$nextDay" size="16" class="text-medium-emphasis stat-arrow" />
              </div>
            </v-card>
          </v-col>
        </v-row>

        <v-row class="mt-2">
          <v-col cols="12" md="6">
            <v-card rounded="lg" variant="outlined" class="h-100">
              <v-card-title class="text-subtitle-1 d-flex align-center">
                {{ $t('admin.supportByType') }}
                <v-spacer />
                <span class="text-caption text-medium-emphasis font-weight-regular">
                  {{ $t('admin.totalClickToFilter', { n: typeComp.total }) }}
                </span>
              </v-card-title>
              <v-divider />
              <v-card-text>
                <template v-if="typeComp.segments.length">
                  <div class="stack">
                    <div
                      v-for="s in typeComp.segments"
                      :key="s.key"
                      class="stack-seg"
                      :style="{ width: s.pct + '%', background: s.color }"
                      :title="`${s.label}: ${s.count} (${s.pct}%)`"
                      @click="openSupport({ type: s.key })"
                    />
                  </div>
                  <div class="legend">
                    <button
                      v-for="s in typeComp.segments"
                      :key="s.key"
                      type="button"
                      class="legend-item"
                      @click="openSupport({ type: s.key })"
                    >
                      <span class="legend-dot" :style="{ background: s.color }" />
                      <span>{{ s.label }}</span>
                      <span class="legend-count">{{ s.count }}</span>
                      <span class="legend-pct">{{ s.pct }}%</span>
                    </button>
                  </div>
                </template>
                <div v-else class="text-medium-emphasis text-center py-6">{{ $t('admin.noTickets') }}</div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" md="6">
            <v-card rounded="lg" variant="outlined" class="h-100">
              <v-card-title class="text-subtitle-1 d-flex align-center">
                {{ $t('admin.supportByStatus') }}
                <v-spacer />
                <span class="text-caption text-medium-emphasis font-weight-regular">
                  {{ $t('admin.totalClickToFilter', { n: statusComp.total }) }}
                </span>
              </v-card-title>
              <v-divider />
              <v-card-text>
                <template v-if="statusComp.segments.length">
                  <div class="stack">
                    <div
                      v-for="s in statusComp.segments"
                      :key="s.key"
                      class="stack-seg"
                      :style="{ width: s.pct + '%', background: s.color }"
                      :title="`${s.label}: ${s.count} (${s.pct}%)`"
                      @click="openSupport({ status: s.key })"
                    />
                  </div>
                  <div class="legend">
                    <button
                      v-for="s in statusComp.segments"
                      :key="s.key"
                      type="button"
                      class="legend-item"
                      @click="openSupport({ status: s.key })"
                    >
                      <span class="legend-dot" :style="{ background: s.color }" />
                      <span>{{ s.label }}</span>
                      <span class="legend-count">{{ s.count }}</span>
                      <span class="legend-pct">{{ s.pct }}%</span>
                    </button>
                  </div>
                </template>
                <div v-else class="text-medium-emphasis text-center py-6">{{ $t('admin.noTickets') }}</div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- ── Operational panels ── -->
        <v-row class="mt-2">
          <!-- Open support queue: where staff actually work. -->
          <v-col cols="12" md="7">
            <v-card rounded="lg" variant="outlined" class="h-100">
              <v-card-title class="text-subtitle-1 d-flex align-center">
                {{ $t('admin.openSupportQueue') }}
                <v-spacer />
                <v-btn size="small" variant="text" @click="openSupport({})">{{ $t('common.viewAll') }}</v-btn>
              </v-card-title>
              <v-divider />
              <v-list v-if="recentOpen.length" lines="two" density="comfortable">
                <v-list-item v-for="t in recentOpen" :key="t.id" class="queue-row" @click="open(t)">
                  <template #prepend>
                    <!-- Fixed-width type column so every title starts at the same x,
                         regardless of the chip's label width (Bug vs Question). -->
                    <div class="queue-type mr-2">
                      <v-chip size="x-small" :color="typeColor[t.type]" variant="tonal">{{ $t('support.types.' + t.type) }}</v-chip>
                    </div>
                  </template>
                  <v-list-item-title class="font-weight-medium">{{ t.subject }}</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ t.company?.name || '—' }} · {{ t.reference }} · {{ ago(t.created_at) }}
                  </v-list-item-subtitle>
                  <template #append>
                    <div class="d-flex align-center" style="gap: 6px">
                      <v-chip size="x-small" :color="priorityColor[t.priority]" variant="tonal">{{ $t('support.priorities.' + t.priority) }}</v-chip>
                      <v-chip size="x-small" :color="statusColor[t.status]" variant="tonal">{{ $t('support.statuses.' + t.status) }}</v-chip>
                    </div>
                  </template>
                </v-list-item>
              </v-list>
              <v-card-text v-else class="text-center text-medium-emphasis py-8">
                <v-icon icon="$completed" color="success" size="28" class="d-block mx-auto mb-2" />
                {{ $t('admin.allCaughtUp') }}
              </v-card-text>
            </v-card>
          </v-col>

          <!-- Companies at a glance: newest first, suspended flagged, quick Manage. -->
          <v-col cols="12" md="5">
            <v-card rounded="lg" variant="outlined" class="h-100">
              <v-card-title class="text-subtitle-1 d-flex align-center">
                {{ $t('admin.companiesPanel') }}
                <v-chip
                  v-if="admin.overview?.suspended_companies"
                  size="x-small"
                  color="error"
                  variant="tonal"
                  class="ml-2"
                >
                  {{ $t('admin.suspendedCount', { n: admin.overview.suspended_companies }) }}
                </v-chip>
                <v-spacer />
                <v-btn size="small" variant="text" @click="tab = 'companies'">{{ $t('common.viewAll') }}</v-btn>
              </v-card-title>
              <v-divider />
              <v-list v-if="recentCompanies.length" density="comfortable">
                <v-list-item
                  v-for="c in recentCompanies"
                  :key="c.id"
                  :to="{ name: 'admin-company', params: { id: c.id } }"
                >
                  <template #prepend>
                    <v-avatar color="secondary" variant="tonal" size="32"><v-icon icon="$company" size="18" /></v-avatar>
                  </template>
                  <v-list-item-title class="font-weight-medium">{{ c.name }}</v-list-item-title>
                  <v-list-item-subtitle>{{ $t('admin.addedAgo', { ago: ago(c.created_at) }) }}</v-list-item-subtitle>
                  <template #append>
                    <v-chip size="x-small" :color="c.status === 'active' ? 'success' : 'grey'" variant="tonal">{{ c.status === 'active' ? $t('admin.active') : $t('admin.suspended') }}</v-chip>
                  </template>
                </v-list-item>
              </v-list>
              <v-card-text v-else class="text-medium-emphasis text-center py-8">{{ $t('admin.noCompaniesYet') }}</v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- Recent platform activity (superadmin only). -->
        <v-row v-if="auth.isSuperAdmin" class="mt-2">
          <v-col cols="12">
            <v-card rounded="lg" variant="outlined">
              <v-card-title class="text-subtitle-1 d-flex align-center">
                {{ $t('admin.recentActivity') }}
                <v-spacer />
                <v-btn size="small" variant="text" @click="tab = 'audit'">{{ $t('common.fullLog') }}</v-btn>
              </v-card-title>
              <v-divider />
              <v-list v-if="recentAudit.length" density="compact">
                <v-list-item v-for="e in recentAudit" :key="e.id">
                  <template #prepend>
                    <!-- Fixed-width action column so every actor/detail starts at the
                         same x, regardless of the action label's width. -->
                    <div class="activity-action mr-2">
                      <v-chip size="x-small" :color="auditActionColor[e.action] || 'grey'" variant="tonal">{{ e.action }}</v-chip>
                    </div>
                  </template>
                  <v-list-item-title class="text-body-2">
                    <span class="font-weight-medium">{{ e.actor_email }}</span>
                    <span class="text-medium-emphasis">
                      <template v-if="e.method"> · {{ e.method }} {{ e.path }}</template>
                      <template v-else-if="e.detail"> · {{ e.detail }}</template>
                    </span>
                  </v-list-item-title>
                  <template #append>
                    <span class="text-caption text-medium-emphasis text-no-wrap">{{ ago(e.created_at) }}</span>
                  </template>
                </v-list-item>
              </v-list>
              <v-card-text v-else class="text-medium-emphasis text-center py-6">{{ $t('admin.noActivity') }}</v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>

      <!-- ══════════════ COMPANIES ══════════════ -->
      <v-window-item value="companies">
        <div class="d-flex flex-wrap align-center mb-3 pt-3" style="gap: 8px">
          <v-text-field
            v-model="companySearch"
            :placeholder="$t('admin.searchCompanies')"
            prepend-inner-icon="$search"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            style="max-width: 300px"
          />
          <v-select
            v-model="companyStatusFilter"
            :items="[{ value: 'active', title: $t('admin.active') }, { value: 'suspended', title: $t('admin.suspended') }]"
            :label="$t('common.status')"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            style="max-width: 170px"
          />
          <v-spacer />
          <span class="text-caption text-medium-emphasis">{{ $t('admin.countOfTotal', { shown: filteredCompanies.length, total: admin.companiesPagination?.total ?? admin.companies.length }) }}</span>
        </div>

        <v-card rounded="lg" variant="outlined">
          <v-table>
            <thead>
              <tr>
                <th>{{ $t('admin.colCompany') }}</th>
                <th class="text-center">{{ $t('admin.colUsers') }}</th>
                <th class="text-center">{{ $t('admin.colTeams') }}</th>
                <th class="text-center">{{ $t('admin.colJobs') }}</th>
                <th>{{ $t('common.status') }}</th>
                <th class="text-end">{{ $t('admin.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in filteredCompanies" :key="c.id">
                <td>
                  <div class="d-flex align-center py-2">
                    <v-avatar color="secondary" variant="tonal" size="36" class="mr-3">
                      <v-icon icon="$company" size="18" />
                    </v-avatar>
                    <div>
                      <div class="font-weight-medium">{{ c.name }}</div>
                      <code class="text-caption text-medium-emphasis">{{ c.slug }}</code>
                    </div>
                  </div>
                </td>
                <td class="text-center">{{ c.user_count || 0 }}</td>
                <td class="text-center">{{ c.team_count || 0 }}</td>
                <td class="text-center">{{ c.job_count || 0 }}</td>
                <td>
                  <v-chip size="small" :color="c.status === 'active' ? 'success' : 'grey'" variant="tonal">
                    <v-icon :icon="c.status === 'active' ? '$completed' : '$onHold'" start size="14" />{{ c.status === 'active' ? $t('admin.active') : $t('admin.suspended') }}
                  </v-chip>
                </td>
                <td class="text-end">
                  <v-btn
                    size="small"
                    variant="tonal"
                    color="primary"
                    prepend-icon="$settings"
                    :to="{ name: 'admin-company', params: { id: c.id } }"
                  >
                    {{ $t('admin.manage') }}
                  </v-btn>
                  <v-btn size="small" variant="text" class="ml-1" prepend-icon="$support" @click="openSupport({ company_id: c.id })">
                    {{ $t('admin.tickets') }}
                  </v-btn>
                  <v-btn
                    v-if="auth.isSuperAdmin"
                    size="small"
                    variant="text"
                    class="ml-1"
                    :color="c.status === 'active' ? 'error' : 'success'"
                    @click="toggleCompany(c)"
                  >
                    {{ c.status === 'active' ? $t('admin.suspend') : $t('admin.reactivate') }}
                  </v-btn>
                </td>
              </tr>
              <tr v-if="!filteredCompanies.length">
                <td colspan="6" class="text-center text-medium-emphasis py-8">{{ $t('admin.noCompanyMatch') }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>

        <v-pagination
          v-if="(admin.companiesPagination?.total_pages || 1) > 1"
          v-model="companiesPage"
          :length="admin.companiesPagination.total_pages"
          :total-visible="7"
          density="comfortable"
          class="mt-4"
          @update:model-value="loadCompanies"
        />
      </v-window-item>

      <!-- ══════════════ SUPPORT ══════════════ -->
      <v-window-item value="support">
        <div class="d-flex flex-wrap align-center mb-3 pt-3" style="gap: 8px">
          <v-text-field
            v-model="ticketSearch"
            :placeholder="$t('admin.searchTickets')"
            prepend-inner-icon="$search"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            style="max-width: 260px"
          />
          <v-select v-model="filters.company_id" :items="companyOptions" :label="$t('admin.colCompany')" variant="outlined" density="compact" hide-details clearable style="max-width: 190px" @update:model-value="onFilterChange" />
          <v-select v-model="filters.status" :items="STATUSES" :label="$t('common.status')" variant="outlined" density="compact" hide-details clearable style="max-width: 150px" @update:model-value="onFilterChange" />
          <v-select v-model="filters.type" :items="TYPES" :label="$t('admin.colType')" variant="outlined" density="compact" hide-details clearable style="max-width: 140px" @update:model-value="onFilterChange" />
          <v-select v-model="filters.priority" :items="PRIORITIES" :label="$t('admin.colPriority')" variant="outlined" density="compact" hide-details clearable style="max-width: 140px" @update:model-value="onFilterChange" />
          <v-btn v-if="hasActiveFilters" variant="text" size="small" prepend-icon="$close" @click="clearFilters">{{ $t('admin.clear') }}</v-btn>
          <v-spacer />
          <span class="text-caption text-medium-emphasis">{{ $t('admin.ticketCount', filteredTickets.length) }}</span>
        </div>

        <v-card rounded="lg" variant="outlined">
          <v-data-table
            :headers="supportHeaders"
            :items="filteredTickets"
            :loading="admin.loading"
            density="comfortable"
            hover
            @click:row="(_, { item }) => open(item)"
          >
            <template #[`item.reference`]="{ item }">
              <span class="font-weight-medium">{{ item.reference }}</span>
            </template>
            <template #[`item.company`]="{ item }">{{ item.company?.name || '—' }}</template>
            <template #[`item.type`]="{ item }">
              <v-chip size="small" :color="typeColor[item.type]" variant="tonal">{{ $t('support.types.' + item.type) }}</v-chip>
            </template>
            <template #[`item.priority`]="{ item }">
              <v-chip size="small" :color="priorityColor[item.priority]" variant="tonal">{{ $t('support.priorities.' + item.priority) }}</v-chip>
            </template>
            <template #[`item.status`]="{ item }">
              <v-chip size="small" :color="statusColor[item.status]" variant="tonal">{{ $t('support.statuses.' + item.status) }}</v-chip>
            </template>
            <template #no-data>
              <div class="text-medium-emphasis py-8">{{ $t('admin.noTicketMatch') }}</div>
            </template>
          </v-data-table>
        </v-card>

        <v-pagination
          v-if="(admin.ticketsPagination?.total_pages || 1) > 1"
          v-model="ticketsPage"
          :length="admin.ticketsPagination.total_pages"
          :total-visible="7"
          density="comfortable"
          class="mt-4"
          @update:model-value="applyFilters"
        />
      </v-window-item>

      <!-- ══════════════ STAFF (superadmin) ══════════════ -->
      <v-window-item value="staff">
        <div class="d-flex align-center mb-4 flex-wrap ga-3">
          <div class="text-body-2 text-medium-emphasis" style="max-width: 640px">
            {{ $t('admin.grantIntroBefore') }}<strong>{{ $t('admin.grantIntroBold') }}</strong>{{ $t('admin.grantIntroAfter') }}
          </div>
          <v-spacer />
          <v-btn color="primary" prepend-icon="$addNew" @click="openAddStaff">{{ $t('admin.addSupportUser') }}</v-btn>
        </div>

        <v-card rounded="lg" variant="outlined">
          <v-table>
            <thead>
              <tr>
                <th>{{ $t('admin.colName') }}</th>
                <th>{{ $t('admin.colEmail') }}</th>
                <th>{{ $t('admin.colPlatformRole') }}</th>
                <th>{{ $t('admin.colCompanyAccess') }}</th>
                <th class="text-end">{{ $t('admin.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in staff" :key="s.id">
                <td class="font-weight-medium">{{ s.name }}</td>
                <td class="text-medium-emphasis">{{ s.email }}</td>
                <td>
                  <v-chip size="small" :color="platformRoleColor[s.platform_role]" variant="tonal">
                    <v-icon :icon="s.platform_role === 'superadmin' ? '$superadmin' : '$account'" start size="14" />
                    {{ $t('admin.platformRoles.' + s.platform_role) }}
                  </v-chip>
                </td>
                <td>
                  <span v-if="s.platform_role === 'superadmin'" class="text-caption text-medium-emphasis">
                    {{ $t('admin.allCompanies') }}
                  </span>
                  <v-chip v-else-if="!s.companies || !s.companies.length" size="small" color="warning" variant="tonal">
                    {{ $t('admin.noCompanyAccess') }}
                  </v-chip>
                  <div v-else class="d-flex flex-wrap align-center py-1" style="gap: 4px">
                    <v-chip v-for="c in s.companies.slice(0, 3)" :key="c.id" size="x-small" color="primary" variant="tonal">
                      {{ c.name }}
                    </v-chip>
                    <span v-if="s.companies.length > 3" class="text-caption text-medium-emphasis">
                      +{{ s.companies.length - 3 }}
                    </span>
                  </div>
                </td>
                <td class="text-end text-no-wrap">
                  <template v-if="s.platform_role !== 'superadmin'">
                    <v-btn size="small" variant="text" prepend-icon="$company" @click="openAssign(s)">
                      {{ $t('admin.manageAccess') }}
                    </v-btn>
                    <v-btn size="small" variant="text" color="error" @click="revokeStaff(s)">{{ $t('admin.revoke') }}</v-btn>
                  </template>
                  <span v-else class="text-caption text-medium-emphasis">{{ $t('admin.operator') }}</span>
                </td>
              </tr>
              <tr v-if="!staff.length">
                <td colspan="5" class="text-center text-medium-emphasis py-8">{{ $t('admin.noStaff') }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>

        <!-- Add a support agent: name + email (a new email creates the account, an
             existing one is promoted), optionally scoped to companies. -->
        <v-dialog v-model="addDialog" max-width="520">
          <v-card rounded="lg">
            <v-card-title class="pa-4">{{ $t('admin.addSupportUser') }}</v-card-title>
            <v-divider />
            <v-card-text class="pa-4">
              <v-text-field
                v-model="addForm.name"
                :label="$t('admin.staffName')"
                prepend-inner-icon="$account"
                variant="outlined"
                autofocus
              />
              <v-text-field
                v-model="addForm.email"
                :label="$t('admin.staffEmail')"
                type="email"
                prepend-inner-icon="$account"
                variant="outlined"
              />
              <v-autocomplete
                v-model="addForm.companies"
                :items="companyItems"
                item-title="title"
                item-value="value"
                :label="$t('admin.assignedCompanies')"
                prepend-inner-icon="$company"
                variant="outlined"
                multiple
                chips
                closable-chips
                clearable
              />
              <p class="text-caption text-medium-emphasis mb-0">{{ $t('admin.staffCompaniesHint') }}</p>
              <p class="text-caption text-medium-emphasis mb-0 mt-2">{{ $t('admin.staffCognitoHint') }}</p>
            </v-card-text>
            <v-divider />
            <v-card-actions class="pa-3">
              <v-spacer />
              <v-btn variant="text" :disabled="addingStaff" @click="addDialog = false">{{ $t('common.cancel') }}</v-btn>
              <v-btn
                color="primary"
                variant="flat"
                :loading="addingStaff"
                :disabled="!addForm.email.trim()"
                @click="addStaff"
              >
                {{ $t('common.add') }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Assign a support agent to specific companies (their assignments ARE
             their access: empty = no company access). -->
        <v-dialog v-model="assignDialog" max-width="520">
          <v-card v-if="assignTarget" rounded="lg">
            <v-card-title class="pa-4">{{ $t('admin.accessTitle', { name: assignTarget.name }) }}</v-card-title>
            <v-divider />
            <v-card-text class="pa-4">
              <p class="text-body-2 text-medium-emphasis mb-3">
                {{ $t('admin.accessIntroBefore') }}<strong>{{ $t('admin.accessIntroBold') }}</strong>{{ $t('admin.accessIntroAfter') }}
              </p>
              <v-autocomplete
                v-model="assignSelected"
                :items="companyItems"
                item-title="title"
                item-value="value"
                :label="$t('admin.assignedCompanies')"
                prepend-inner-icon="$company"
                variant="outlined"
                multiple
                chips
                closable-chips
                clearable
              />
              <v-alert v-if="!assignSelected.length" type="warning" variant="tonal" density="compact">
                {{ $t('admin.noneWarning') }}
              </v-alert>
            </v-card-text>
            <v-divider />
            <v-card-actions class="pa-3">
              <v-spacer />
              <v-btn variant="text" :disabled="assignSaving" @click="assignDialog = false">{{ $t('common.cancel') }}</v-btn>
              <v-btn color="primary" variant="flat" :loading="assignSaving" @click="saveAssign">{{ $t('admin.saveAccess') }}</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-window-item>

      <!-- ══════════════ AUDIT (superadmin) ══════════════ -->
      <v-window-item value="audit">
        <v-card rounded="lg" variant="outlined">
          <v-table density="comfortable">
            <thead>
              <tr>
                <th>{{ $t('admin.colWhen') }}</th>
                <th>{{ $t('admin.colActor') }}</th>
                <th>{{ $t('admin.colAction') }}</th>
                <th>{{ $t('admin.colCompany') }}</th>
                <th>{{ $t('admin.colDetail') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in audit" :key="e.id">
                <td class="text-no-wrap text-caption">{{ auditWhen(e.created_at) }}</td>
                <td class="text-caption">{{ e.actor_email }}</td>
                <td>
                  <v-chip size="x-small" :color="auditActionColor[e.action] || 'grey'" variant="tonal">{{ e.action }}</v-chip>
                </td>
                <td class="text-caption">{{ e.company_id || '—' }}</td>
                <td class="text-caption text-medium-emphasis">
                  <code v-if="e.method">{{ e.method }} {{ e.path }}</code>
                  <span v-else>{{ e.detail }}</span>
                </td>
              </tr>
              <tr v-if="!audit.length">
                <td colspan="5" class="text-center text-medium-emphasis py-8">{{ $t('admin.noActivity') }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>

        <v-pagination
          v-if="(auditPagination?.total_pages || 1) > 1"
          v-model="auditPage"
          :length="auditPagination.total_pages"
          :total-visible="7"
          density="comfortable"
          class="mt-4"
          @update:model-value="loadAudit"
        />
      </v-window-item>
    </v-window>

    <!-- ══════════════ TRIAGE DETAIL ══════════════ -->
    <v-dialog v-model="detailDialog" max-width="680" scrollable>
      <v-card v-if="ticket" rounded="lg">
        <v-card-item>
          <template #prepend>
            <v-chip size="small" :color="typeColor[ticket.type]" variant="tonal" class="mr-1">{{ $t('support.types.' + ticket.type) }}</v-chip>
          </template>
          <v-card-title>{{ ticket.subject }}</v-card-title>
          <v-card-subtitle>{{ ticket.reference }} · {{ ticket.company?.name }}</v-card-subtitle>
          <template #append><v-btn icon="$close" variant="text" @click="detailDialog = false" /></template>
        </v-card-item>
        <v-divider />
        <v-card-text style="max-height: 62vh">
          <v-row dense class="mb-2">
            <v-col cols="6">
              <v-select :model-value="ticket.status" :items="STATUSES" :label="$t('common.status')" variant="outlined" density="compact" hide-details @update:model-value="(v) => triage('status', v)" />
            </v-col>
            <v-col cols="6">
              <v-select :model-value="ticket.priority" :items="PRIORITIES" :label="$t('admin.colPriority')" variant="outlined" density="compact" hide-details @update:model-value="(v) => triage('priority', v)" />
            </v-col>
          </v-row>

          <div
            v-for="c in ticket.comments"
            :key="c.id"
            class="mb-3 pa-3 rounded-lg"
            :class="c.from_admin ? 'bg-blue-lighten-5' : 'bg-grey-lighten-4'"
          >
            <div class="d-flex align-center mb-1">
              <v-icon :icon="c.from_admin ? '$admin' : '$account'" size="small" class="mr-1" />
              <span class="font-weight-medium text-body-2">{{ c.author_name || (c.from_admin ? $t('admin.supportTag') : $t('admin.companyTag')) }}</span>
              <v-chip v-if="c.from_admin" size="x-small" color="primary" variant="tonal" class="ml-2">{{ $t('admin.supportTag') }}</v-chip>
              <v-spacer />
              <span class="text-caption text-medium-emphasis">{{ fmt(c.created_at) }}</span>
            </div>
            <div class="text-body-2" style="white-space: pre-wrap">{{ c.body }}</div>
          </div>
          <div v-if="!ticket.comments || !ticket.comments.length" class="text-medium-emphasis">{{ $t('admin.noMessages') }}</div>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-text-field v-model="reply" :placeholder="$t('admin.replyAsSupport')" variant="outlined" density="comfortable" hide-details @keyup.enter="sendReply" />
          <v-btn color="primary" icon="$nextDay" class="ml-2" :disabled="!reply.trim()" @click="sendReply" />
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.stat-tile {
  position: relative;
  transition: box-shadow 0.15s, transform 0.15s, border-color 0.15s;
}
.stat-clickable {
  cursor: pointer;
}
.stat-clickable:hover {
  border-color: rgba(var(--v-theme-primary), 0.5);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}
.stat-arrow {
  position: absolute;
  top: 10px;
  right: 12px;
  opacity: 0;
  transition: opacity 0.15s;
}
.stat-clickable:hover .stat-arrow {
  opacity: 1;
}
.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.stat-label {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stat-delta {
  font-size: 0.75rem;
  line-height: 1.15rem;
  min-height: 1.15rem; /* reserve the line even when blank, so every tile matches */
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.queue-row {
  cursor: pointer;
}
/* Uniform type column: chips left-aligned in a fixed band so their left edges —
   and every ticket title after them — line up in a clean column. Wide enough for
   the longest label ("Question"). */
.queue-type {
  width: 76px;
  display: flex;
  justify-content: flex-start;
}
/* Same idea for the audit feed: a fixed action column (fits the longest label,
   "company.status") so actor emails and details line up under each other. */
.activity-action {
  width: 96px;
  display: flex;
  justify-content: flex-start;
}

/* Part-to-whole: a slim 100%-stacked bar. 2px surface gaps separate segments;
   the outer ends are rounded, the interior joins square (mark spec). */
.stack {
  display: flex;
  gap: 2px;
  height: 12px;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 16px;
}
.stack-seg {
  height: 100%;
  min-width: 3px;
  cursor: pointer;
  transition: opacity 0.12s;
}
.stack-seg:hover {
  opacity: 0.82;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 2px 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.legend-item:hover {
  color: rgb(var(--v-theme-on-surface));
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex: none;
}
.legend-count {
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}
.legend-pct {
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-variant-numeric: tabular-nums;
}
</style>
