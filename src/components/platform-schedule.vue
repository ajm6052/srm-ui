<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminStore } from '@stores/admin'
import { useAuthStore } from '@stores/auth'
import { useMessagesStore } from '@stores/messages'
import JobStatusChip from '@components/job-status-chip.vue'
import {
  toStr,
  addDaysStr,
  mondayOf,
  todayInZone,
  dayInZone,
  formatTime,
  zoneLabel,
  statusColor,
  resourceIcon,
} from '@utils/calendar'

// Each company has its own time zone, so times are formatted and days are bucketed
// per company (a job's own company zone), not the viewer's. `time(iso, tz)` binds
// that at each call site. The neutral calendar grid (which day is "today", the day
// labels) uses the viewer's own zone.
const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone
const time = (iso, tz) => formatTime(iso, tz)
const todayStr = () => todayInZone(viewerTz)

// Platform oversight board: the schedule across every company the signed-in
// staff member may access (superadmin → all; support → assigned companies).
// It's read-only — staff observe here and act through the admin tools — so there
// is no create/edit/drag, only a company filter and the day/week/month views.
const admin = useAdminStore()
const auth = useAuthStore()
const messages = useMessagesStore()
// Aliased to `tr` because several .map((t) => …) loops below use `t` for a team.
const { t: tr, locale } = useI18n({ useScope: 'global' })
// Weekday/month names follow the selected app language, not the browser's.
const dateLocale = computed(() => locale.value)

const SELECTION_KEY = 'srm.platformScheduleCompanies'

// --- view mode (shares the persisted key with the company schedule) ---
const mode = ref(readMode())
function readMode() {
  try {
    const m = localStorage.getItem('srm.scheduleMode')
    return m === 'week' || m === 'month' ? m : 'day'
  } catch {
    return 'day'
  }
}
function setMode(m) {
  mode.value = m
  try {
    localStorage.setItem('srm.scheduleMode', m)
  } catch {
    // ignore — mode just won't persist
  }
  reload()
}

const date = ref(todayStr())
const loading = ref(false)

// Companies the staff member may access, and the ids currently shown. The
// operator's own internal workspace has no field work to schedule, so it never
// appears on this board.
const companies = computed(() => (admin.companies || []).filter((c) => !c.is_internal))
const selected = ref([])
// Per-company payloads: { [companyId]: { teams, members, jobs } }.
const data = ref({})

// --- date ranges (local, string-based) ---
const weekStart = computed(() => mondayOf(date.value))
const weekDays = computed(() => {
  const today = todayStr()
  return Array.from({ length: 7 }, (_, i) => {
    const str = addDaysStr(weekStart.value, i)
    const d = new Date(str + 'T00:00:00')
    return {
      str,
      weekday: d.toLocaleDateString(dateLocale.value, { weekday: 'short' }),
      label: d.toLocaleDateString(dateLocale.value, { month: 'short', day: 'numeric' }),
      isToday: str === today,
    }
  })
})
const monthGridStart = computed(() => {
  const d = new Date(date.value + 'T00:00:00')
  return mondayOf(toStr(new Date(d.getFullYear(), d.getMonth(), 1)))
})
const monthDays = computed(() => {
  const today = todayStr()
  const monthIdx = new Date(date.value + 'T00:00:00').getMonth()
  return Array.from({ length: 42 }, (_, i) => {
    const str = addDaysStr(monthGridStart.value, i)
    const d = new Date(str + 'T00:00:00')
    return {
      str,
      dayNum: d.getDate(),
      inMonth: d.getMonth() === monthIdx,
      isToday: str === today,
    }
  })
})
const monthWeekdayNames = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monthGridStart.value + 'T00:00:00')
    d.setDate(d.getDate() + i)
    return d.toLocaleDateString(dateLocale.value, { weekday: 'short' })
  }),
)

function rangeForMode() {
  if (mode.value === 'week') return [weekStart.value, addDaysStr(weekStart.value, 7)]
  if (mode.value === 'month') return [monthGridStart.value, addDaysStr(monthGridStart.value, 42)]
  return [date.value, addDaysStr(date.value, 1)]
}

// --- data loading (fan out over the selected companies) ---
async function reload() {
  const ids = [...selected.value]
  if (!ids.length) {
    data.value = {}
    return
  }
  const [from, to] = rangeForMode()
  loading.value = true
  try {
    const entries = await Promise.all(
      ids.map(async (cid) => {
        const [teamsRes, usersRes, jobsRes] = await Promise.all([
          admin.companyTeams(cid),
          admin.companyUsers(cid, { page: 1, pageSize: 100 }),
          admin.companyJobs(cid, { from, to }),
        ])
        return [
          cid,
          {
            teams: teamsRes.data || [],
            members: usersRes.data || [],
            jobs: jobsRes.data || [],
          },
        ]
      }),
    )
    data.value = Object.fromEntries(entries)
  } catch (err) {
    messages.error(err.message || tr('schedule.couldNotLoadSchedules'))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    await admin.fetchCompanies({ page: 1, pageSize: 100 })
  } catch (err) {
    messages.error(err.message || tr('schedule.couldNotLoadCompanies'))
    return
  }
  selected.value = restoreSelection(companies.value.map((c) => c.id))
  await reload()
})

// --- company selection (remembered per browser) ---
function restoreSelection(allIds) {
  try {
    const raw = localStorage.getItem(SELECTION_KEY)
    if (raw) {
      const saved = JSON.parse(raw).filter((id) => allIds.includes(id))
      if (saved.length) return saved
    }
  } catch {
    // fall through to "all selected"
  }
  return allIds
}
function persistSelection(ids) {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(ids))
  } catch {
    // ignore — selection just won't persist
  }
}
function onSelectionChange(ids) {
  selected.value = ids
  persistSelection(ids)
  reload()
}
function selectAll() {
  onSelectionChange(companies.value.map((c) => c.id))
}
function clearAll() {
  onSelectionChange([])
}

// --- navigation ---
function shift(delta) {
  if (mode.value === 'week') date.value = addDaysStr(date.value, delta * 7)
  else if (mode.value === 'month') {
    const d = new Date(date.value + 'T00:00:00')
    d.setMonth(d.getMonth() + delta)
    date.value = toStr(d)
  } else date.value = addDaysStr(date.value, delta)
  reload()
}
function goToday() {
  date.value = todayStr()
  reload()
}

// --- grouping ---
function jobResourceKey(j) {
  if (j.team_id) return `team:${j.team_id}`
  if (j.member_id) return `member:${j.member_id}`
  return ''
}
function jobResourceName(j) {
  if (j.team) return j.team.name
  if (j.member) return j.member.name
  return ''
}
function jobPlace(j) {
  if (j.site) return j.site.address || j.site.label
  return j.location || ''
}

// One assembled block per selected company: its resource rows plus job lookups.
const blocks = computed(() =>
  selected.value
    .map((cid) => companies.value.find((c) => c.id === cid))
    .filter(Boolean)
    .map((c) => {
      const d = data.value[c.id] || { teams: [], members: [], jobs: [] }
      const teams = d.teams.map((t) => ({
        key: `team:${t.id}`,
        type: 'team',
        id: t.id,
        name: t.name,
        sub: t.leader ? t.leader.name : tr('teams.noLeader'),
      }))
      const members = d.members.map((m) => ({
        key: `member:${m.id}`,
        type: 'member',
        id: m.id,
        name: m.name,
        sub: m.role ? tr('roles.' + m.role) : '',
      }))
      const rows = []
      if (teams.length) rows.push({ group: 'teams' }, ...teams)
      if (members.length) rows.push({ group: 'members' }, ...members)

      const byResource = {}
      const byResourceDay = {}
      for (const j of d.jobs) {
        const k = jobResourceKey(j)
        ;(byResource[k] ||= []).push(j)
        const rd = (byResourceDay[k] ||= {})
        ;(rd[dayInZone(j.scheduled_start, c.timezone)] ||= []).push(j)
      }
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        timezone: c.timezone,
        teams,
        members,
        rows,
        resources: [...teams, ...members],
        byResource,
        byResourceDay,
        jobCount: d.jobs.length,
        hasResources: teams.length + members.length > 0,
      }
    }),
)

// Month is a single combined calendar across the selected companies; each chip
// is tagged with its company so the birds-eye view stays legible.
const monthByDay = computed(() => {
  const map = {}
  for (const c of blocks.value) {
    for (const j of data.value[c.id]?.jobs || []) {
      ;(map[dayInZone(j.scheduled_start, c.timezone)] ||= []).push({
        ...j,
        _company: c.name,
        _tz: c.timezone,
      })
    }
  }
  for (const k in map) {
    map[k].sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start))
  }
  return map
})

// --- header labels ---
const prettyDate = computed(() =>
  new Date(date.value + 'T00:00:00').toLocaleDateString(dateLocale.value, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
)
const prettyWeek = computed(() => {
  const start = new Date(weekStart.value + 'T00:00:00')
  const end = new Date(addDaysStr(weekStart.value, 6) + 'T00:00:00')
  const opts = { month: 'short', day: 'numeric' }
  return tr('schedule.weekOf', {
    start: start.toLocaleDateString(dateLocale.value, opts),
    end: end.toLocaleDateString(dateLocale.value, opts),
  })
})
const prettyMonth = computed(() =>
  new Date(date.value + 'T00:00:00').toLocaleDateString(dateLocale.value, { month: 'long', year: 'numeric' }),
)
const headerSubtitle = computed(() =>
  mode.value === 'week' ? prettyWeek.value : mode.value === 'month' ? prettyMonth.value : prettyDate.value,
)
// How the current company filter reads in the header.
const scopeLabel = computed(() => {
  const n = selected.value.length
  const total = companies.value.length
  if (!n) return tr('schedule.noCompaniesSelected')
  if (n === total) return tr('schedule.scopeAll')
  if (n === 1) {
    const c = companies.value.find((x) => x.id === selected.value[0])
    return c ? c.name : tr('schedule.scopeOne')
  }
  return tr('schedule.scopeCount', { n, total })
})

// --- read-only detail dialog ---
const detailDialog = ref(false)
const detail = ref(null)
function openDetail(job, block) {
  detail.value = {
    ...job,
    _company: block?.name || job._company || '',
    _tz: block?.timezone || job._tz || 'UTC',
  }
  detailDialog.value = true
}
const detailWhen = computed(() => {
  if (!detail.value) return ''
  const tz = detail.value._tz
  const dateStr = new Date(detail.value.scheduled_start).toLocaleDateString(dateLocale.value, {
    timeZone: tz,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
  return `${dateStr} · ${time(detail.value.scheduled_start, tz)} – ${time(detail.value.scheduled_end, tz)} · ${zoneLabel(tz)}`
})
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <!-- Header: title + controls (no "New job" — this view is read-only) -->
    <div class="d-flex flex-wrap align-center mb-4" style="gap: 12px">
      <div>
        <h1 class="text-h5 font-weight-bold">{{ $t('schedule.title') }}</h1>
        <div class="text-medium-emphasis">
          {{ headerSubtitle }} · {{ scopeLabel }}
        </div>
      </div>
      <v-spacer />

      <v-btn-toggle
        :model-value="mode"
        density="comfortable"
        variant="outlined"
        divided
        mandatory
        @update:model-value="setMode"
      >
        <v-btn value="day" prepend-icon="$viewDay">{{ $t('schedule.day') }}</v-btn>
        <v-btn value="week" prepend-icon="$viewWeek">{{ $t('schedule.week') }}</v-btn>
        <v-btn value="month" prepend-icon="$schedule">{{ $t('schedule.month') }}</v-btn>
      </v-btn-toggle>

      <v-btn-group variant="outlined" divided>
        <v-btn icon="$prevDay" @click="shift(-1)" />
        <v-btn @click="goToday">{{ $t('common.today') }}</v-btn>
        <v-btn icon="$nextDay" @click="shift(1)" />
      </v-btn-group>

      <v-text-field
        v-model="date"
        type="date"
        variant="outlined"
        density="compact"
        hide-details
        style="max-width: 170px"
        @update:model-value="reload"
      />
      <v-btn icon="$refresh" variant="text" :loading="loading" @click="reload" />
    </div>

    <!-- Company filter -->
    <div class="d-flex flex-wrap align-center mb-4" style="gap: 12px">
      <v-select
        :model-value="selected"
        :items="companies"
        item-title="name"
        item-value="id"
        multiple
        :label="$t('schedule.companies')"
        prepend-inner-icon="$company"
        variant="outlined"
        density="comfortable"
        hide-details
        persistent-placeholder
        style="min-width: 280px; max-width: 340px"
        @update:model-value="onSelectionChange"
      >
        <template #prepend-item>
          <v-list-item :title="$t('schedule.selectAll')" @click="selectAll">
            <template #prepend><v-icon icon="$company" /></template>
          </v-list-item>
          <v-list-item :title="$t('schedule.clear')" :disabled="!selected.length" @click="clearAll">
            <template #prepend><v-icon icon="$close" /></template>
          </v-list-item>
          <v-divider />
        </template>
        <!-- Single-line summary keeps the field one row high (so the label floats
             cleanly) rather than wrapping a chip per company. -->
        <template #selection="{ index }">
          <span v-if="index === 0" class="text-body-2">
            {{
              selected.length === companies.length
                ? $t('schedule.allCompanies')
                : $t('schedule.countSelected', { count: selected.length, total: companies.length })
            }}
          </span>
        </template>
      </v-select>
      <v-progress-circular v-if="loading" indeterminate size="20" width="2" color="primary" />
    </div>

    <!-- Empty states -->
    <v-alert v-if="!companies.length" type="info" variant="tonal">
      <template v-if="auth.isSuperAdmin">{{ $t('schedule.noCompaniesYet') }}</template>
      <template v-else>
        {{ $t('schedule.notAssigned') }}
      </template>
    </v-alert>
    <v-alert v-else-if="!selected.length" type="info" variant="tonal">
      {{ $t('schedule.selectAtLeastOne') }}
    </v-alert>

    <!-- ===================== MONTH (combined calendar) ===================== -->
    <v-card v-else-if="mode === 'month'" rounded="lg" variant="outlined">
      <div class="month-grid month-head">
        <div v-for="w in monthWeekdayNames" :key="w" class="month-weekday">{{ w }}</div>
      </div>
      <v-divider />
      <div class="month-grid">
        <div
          v-for="d in monthDays"
          :key="d.str"
          class="month-cell"
          :class="{ 'month-out': !d.inMonth, 'month-today': d.isToday }"
        >
          <div class="month-daynum" :class="{ 'font-weight-bold': d.isToday }">{{ d.dayNum }}</div>
          <div
            v-for="job in (monthByDay[d.str] || []).slice(0, 4)"
            :key="job.id"
            class="month-job text-truncate"
            :style="{ '--sc': statusColor[job.status] }"
            :class="{ 'sched-job--tentative': !job.confirmed, 'sched-job--cancelled': job.status === 'cancelled' }"
            :title="`${time(job.scheduled_start, job._tz)} · ${job._company} · ${jobResourceName(job)} · ${job.title}`"
            @click="openDetail(job)"
          >
            <span class="month-job-co">{{ job._company }}</span> {{ job.title }}
          </div>
          <div v-if="(monthByDay[d.str] || []).length > 4" class="text-caption text-medium-emphasis px-1">
            {{ $t('schedule.moreCount', { count: (monthByDay[d.str] || []).length - 4 }) }}
          </div>
        </div>
      </div>
    </v-card>

    <!-- ===================== DAY / WEEK (per company) ===================== -->
    <template v-else>
      <div v-for="block in blocks" :key="block.id" class="mb-6">
        <!-- Company band -->
        <div class="company-band">
          <v-icon icon="$company" size="small" class="mr-2 text-medium-emphasis" />
          <span class="company-name">{{ block.name }}</span>
          <v-chip
            v-if="block.status === 'suspended'"
            size="x-small"
            color="error"
            variant="tonal"
            class="ml-2"
          >
            {{ $t('schedule.suspended') }}
          </v-chip>
          <v-spacer />
          <span class="text-caption text-medium-emphasis d-flex align-center" style="gap: 4px">
            <v-icon icon="$schedule" size="x-small" /> {{ zoneLabel(block.timezone) }}
            <span class="mx-1">·</span>
            {{ $t('schedule.jobsCount', block.jobCount) }}
          </span>
        </div>

        <v-alert
          v-if="!block.hasResources"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-2"
        >
          {{ $t('schedule.noResourcesInCompany') }}
        </v-alert>

        <!-- DAY -->
        <template v-else-if="mode === 'day'">
          <template v-for="group in ['team', 'member']" :key="group">
            <div
              v-if="block.resources.some((r) => r.type === group)"
              class="text-overline text-medium-emphasis mt-2 mb-1"
            >
              {{ group === 'team' ? $t('schedule.teams') : $t('schedule.members') }}
            </div>
            <v-row>
              <v-col
                v-for="res in block.resources.filter((r) => r.type === group)"
                :key="res.key"
                cols="12"
                md="6"
                lg="4"
              >
                <v-card rounded="lg" variant="outlined" class="h-100">
                  <v-card-item>
                    <template #prepend>
                      <v-avatar color="primary" variant="tonal" size="38">
                        <v-icon :icon="resourceIcon(res.type)" />
                      </v-avatar>
                    </template>
                    <v-card-title class="text-subtitle-1 font-weight-bold">{{ res.name }}</v-card-title>
                    <v-card-subtitle>{{ res.sub }}</v-card-subtitle>
                    <template #append>
                      <v-chip v-if="(block.byResource[res.key] || []).length" size="small" variant="tonal" color="secondary">
                        {{ (block.byResource[res.key] || []).length }}
                      </v-chip>
                    </template>
                  </v-card-item>
                  <v-divider />

                  <v-list v-if="(block.byResource[res.key] || []).length" density="comfortable" lines="two">
                    <template v-for="(job, i) in block.byResource[res.key]" :key="job.id">
                      <v-divider v-if="i > 0" inset />
                      <v-list-item class="job-row--clickable" @click="openDetail(job, block)">
                        <template #prepend>
                          <div class="text-center mr-2" style="min-width: 58px">
                            <div class="text-body-2 font-weight-bold">{{ time(job.scheduled_start, block.timezone) }}</div>
                            <div class="text-caption text-medium-emphasis">{{ time(job.scheduled_end, block.timezone) }}</div>
                          </div>
                        </template>
                        <v-list-item-title class="font-weight-medium">
                          {{ job.title }}
                          <v-chip v-if="!job.confirmed" size="x-small" color="warning" variant="tonal" class="ml-1">{{ $t('schedule.tentative') }}</v-chip>
                        </v-list-item-title>
                        <v-list-item-subtitle>
                          <span class="text-caption text-medium-emphasis mr-1">{{ job.reference }}</span>
                          <span v-if="job.customer">· <v-icon icon="$company" size="x-small" /> {{ job.customer.name }}</span>
                          <span v-if="jobPlace(job)">· <v-icon icon="$location" size="x-small" /> {{ jobPlace(job) }}</span>
                        </v-list-item-subtitle>
                        <template #append>
                          <job-status-chip :status="job.status" />
                        </template>
                      </v-list-item>
                    </template>
                  </v-list>

                  <v-card-text v-else class="text-center text-medium-emphasis py-6">{{ $t('schedule.noJobsThisDay') }}</v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </template>
        </template>

        <!-- WEEK -->
        <v-card v-else rounded="lg" variant="outlined" class="mt-2">
          <div class="week-scroll">
            <div class="week-grid">
              <div class="week-corner">{{ $t('schedule.resource') }}</div>
              <div v-for="d in weekDays" :key="d.str" class="week-head" :class="{ 'week-today': d.isToday }">
                <div class="font-weight-bold">{{ d.weekday }}</div>
                <div class="text-caption text-medium-emphasis">{{ d.label }}</div>
              </div>

              <template v-for="row in block.rows" :key="row.group || row.key">
                <div v-if="row.group" class="week-group">{{ $t('schedule.' + row.group) }}</div>
                <template v-else>
                  <div class="week-res">
                    <div class="d-flex align-center">
                      <v-icon :icon="resourceIcon(row.type)" size="small" class="mr-2 text-medium-emphasis" />
                      <div style="min-width: 0">
                        <div class="font-weight-medium text-truncate">{{ row.name }}</div>
                        <div class="text-caption text-medium-emphasis text-truncate">{{ row.sub }}</div>
                      </div>
                    </div>
                  </div>
                  <div
                    v-for="d in weekDays"
                    :key="row.key + '-' + d.str"
                    class="week-cell"
                    :class="{ 'week-today-cell': d.isToday }"
                  >
                    <div
                      v-for="job in (block.byResourceDay[row.key] && block.byResourceDay[row.key][d.str]) || []"
                      :key="job.id"
                      class="week-job clickable"
                      :style="{ '--sc': statusColor[job.status] }"
                      :class="{
                        'sched-job--cancelled': job.status === 'cancelled',
                        'sched-job--tentative': !job.confirmed,
                      }"
                      :title="`${time(job.scheduled_start, block.timezone)} · ${job.title}${job.confirmed ? '' : ' (tentative)'}`"
                      @click="openDetail(job, block)"
                    >
                      <div class="week-job-time">{{ time(job.scheduled_start, block.timezone) }}</div>
                      <div class="week-job-title text-truncate">{{ job.title }}</div>
                    </div>
                  </div>
                </template>
              </template>
            </div>
          </div>
        </v-card>
      </div>
    </template>

    <!-- Read-only job detail -->
    <v-dialog v-model="detailDialog" max-width="520">
      <v-card v-if="detail" rounded="lg">
        <v-card-title class="d-flex align-center pa-4">
          <v-icon icon="$job" class="mr-2" />
          {{ detail.title }}
          <v-chip v-if="!detail.confirmed" size="x-small" color="warning" variant="tonal" class="ml-2">{{ $t('schedule.tentative') }}</v-chip>
          <v-spacer />
          <v-btn icon="$close" variant="text" density="comfortable" @click="detailDialog = false" />
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <div class="detail-grid">
            <div class="detail-label">{{ $t('schedule.detail.company') }}</div>
            <div>{{ detail._company }}</div>
            <div class="detail-label">{{ $t('schedule.detail.resource') }}</div>
            <div>{{ jobResourceName(detail) || '—' }}</div>
            <div class="detail-label">{{ $t('schedule.detail.when') }}</div>
            <div>{{ detailWhen }}</div>
            <div class="detail-label">{{ $t('schedule.detail.status') }}</div>
            <div><job-status-chip :status="detail.status" /></div>
            <template v-if="detail.customer">
              <div class="detail-label">{{ $t('schedule.detail.customer') }}</div>
              <div><v-icon icon="$company" size="x-small" /> {{ detail.customer.name }}</div>
            </template>
            <template v-if="detail.site">
              <div class="detail-label">{{ $t('schedule.detail.site') }}</div>
              <div>
                <v-icon icon="$location" size="x-small" /> {{ detail.site.label }}
                <span v-if="detail.site.address" class="text-medium-emphasis"> — {{ detail.site.address }}</span>
              </div>
            </template>
            <template v-if="detail.location">
              <div class="detail-label">{{ $t('schedule.detail.locationNote') }}</div>
              <div>{{ detail.location }}</div>
            </template>
            <template v-if="detail.description">
              <div class="detail-label">{{ $t('schedule.detail.details') }}</div>
              <div style="white-space: pre-wrap">{{ detail.description }}</div>
            </template>
            <div class="detail-label">{{ $t('schedule.detail.reference') }}</div>
            <div class="text-medium-emphasis">{{ detail.reference }}</div>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
/* Company section header. */
.company-band {
  display: flex;
  align-items: center;
  padding: 8px 4px;
  border-bottom: 2px solid rgba(var(--v-theme-primary), 0.25);
  margin-bottom: 4px;
}
.company-name {
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: -0.01em;
}

.job-row--clickable {
  cursor: pointer;
}
.job-row--clickable:hover {
  background: rgba(var(--v-theme-primary), 0.05);
}

/* ── Week grid (resource timeline) ── */
.week-scroll {
  overflow-x: auto;
}
.week-grid {
  display: grid;
  grid-template-columns: 180px repeat(7, minmax(150px, 1fr));
  min-width: 960px;
}
.week-corner,
.week-head {
  position: sticky;
  top: 0;
  padding: 10px 12px;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), 0.18);
  text-align: center;
}
.week-corner {
  text-align: left;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.week-head.week-today {
  background: rgba(var(--v-theme-primary), 0.08);
  box-shadow: inset 0 -2px 0 rgb(var(--v-theme-primary));
}
.week-head.week-today .font-weight-bold {
  color: rgb(var(--v-theme-primary));
}
.week-group {
  grid-column: 1 / -1;
  padding: 6px 12px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.55);
  background: rgba(var(--v-theme-on-surface), 0.03);
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
}
.week-res {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.14);
  border-right: 1px solid rgba(var(--v-border-color), 0.14);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.week-cell {
  position: relative;
  padding: 6px;
  min-height: 76px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.14);
  border-right: 1px solid rgba(var(--v-border-color), 0.08);
}
.week-today-cell {
  background: rgba(var(--v-theme-primary), 0.04);
}
.week-job {
  border-left: 3px solid var(--sc);
  background: color-mix(in srgb, var(--sc) 12%, transparent);
  border-radius: 6px;
  padding: 4px 8px;
  margin-bottom: 4px;
  line-height: 1.25;
}
.week-job-time {
  font-size: 0.6875rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.85);
}
.week-job-title {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.75);
}
.week-job.clickable {
  cursor: pointer;
  transition: background 0.12s;
}
.week-job.clickable:hover {
  background: color-mix(in srgb, var(--sc) 22%, transparent);
}
.sched-job--cancelled {
  opacity: 0.6;
}
.sched-job--cancelled .week-job-title {
  text-decoration: line-through;
}
/* Tentative jobs read as penciled-in: dashed border, no solid fill. */
.sched-job--tentative {
  border-left-style: dashed;
  background: transparent;
  outline: 1px dashed color-mix(in srgb, var(--sc) 55%, transparent);
  outline-offset: -1px;
}

/* ── Month grid (combined) ── */
.month-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.month-head .month-weekday {
  padding: 8px;
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.month-cell {
  min-height: 104px;
  padding: 4px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
  border-right: 1px solid rgba(var(--v-border-color), 0.08);
}
.month-out {
  background: rgba(var(--v-theme-on-surface), 0.02);
}
.month-out .month-daynum {
  opacity: 0.4;
}
.month-today .month-daynum {
  color: #fff;
  background: rgb(var(--v-theme-primary));
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.month-daynum {
  font-size: 0.8125rem;
  padding: 2px 4px;
}
.month-job {
  font-size: 0.7rem;
  line-height: 1.4;
  padding: 1px 6px;
  margin: 2px 2px 0;
  border-left: 3px solid var(--sc);
  background: color-mix(in srgb, var(--sc) 12%, transparent);
  border-radius: 4px;
  cursor: pointer;
}
.month-job-co {
  font-weight: 700;
}

/* ── Detail dialog ── */
.detail-grid {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 8px 12px;
  align-items: baseline;
}
.detail-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
</style>
