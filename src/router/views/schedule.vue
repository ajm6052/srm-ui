<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useJobsStore } from '@stores/jobs'
import { useTeamsStore } from '@stores/teams'
import { useUsersStore } from '@stores/users'
import { useAuthStore } from '@stores/auth'
import { useMessagesStore } from '@stores/messages'
import JobStatusChip from '@components/job-status-chip.vue'
import JobDialog from '@components/job-dialog.vue'
import PlatformSchedule from '@components/platform-schedule.vue'
import {
  toStr,
  addDaysStr,
  mondayOf,
  todayInZone,
  dayInZone,
  formatTime,
  splitInZone,
  toUTCISO,
  zoneLabel,
  statusColor,
  resourceIcon,
} from '@utils/calendar'

const jobs = useJobsStore()
const teams = useTeamsStore()
const users = useUsersStore()
const auth = useAuthStore()
const messages = useMessagesStore()
// Aliased to `tr` because several .map((t) => …) loops below use `t` for a team.
const { t: tr, locale } = useI18n({ useScope: 'global' })
// Weekday/month names follow the selected app language, not the browser's.
const dateLocale = computed(() => locale.value)

// All job times are entered, shown and grouped in the company's time zone (not
// the viewer's), so the schedule reads the same for everyone. These wrappers bind
// the company zone to the shared calendar helpers.
const tz = computed(() => auth.company?.timezone || 'UTC')
const time = (iso) => formatTime(iso, tz.value)
const localDay = (iso) => dayInZone(iso, tz.value)
const todayStr = () => todayInZone(tz.value)

// Platform staff (superadmin / support) aren't a company resource and don't
// schedule their own work — they get the read-only cross-company board instead
// (rendered by <platform-schedule>), so the whole single-company path below is
// skipped for them.
const platformView = computed(() => auth.isPlatformStaff)

const canManage = computed(() => auth.can('jobs:manage'))
// A team leader is scoped to their own teams (matching the API); everyone else
// sees all teams, and — with users:view — the individual members too.
const isLeaderScoped = computed(() => auth.role === 'team_leader' && !auth.isPlatformAdmin)
const canSeeMembers = computed(() => auth.can('users:view') && !isLeaderScoped.value)

// Day / week / month, remembered per browser.
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

// --- resources (rows): teams + individual members ---
const visibleTeams = computed(() =>
  isLeaderScoped.value
    ? teams.items.filter((t) => t.leader_id === auth.user?.id)
    : teams.items,
)
const teamResources = computed(() =>
  visibleTeams.value.map((t) => ({
    key: `team:${t.id}`,
    type: 'team',
    id: t.id,
    name: t.name,
    sub: t.leader ? t.leader.name : tr('teams.noLeader'),
  })),
)
const memberResources = computed(() =>
  canSeeMembers.value
    ? users.items.map((m) => ({
        key: `member:${m.id}`,
        type: 'member',
        id: m.id,
        name: m.name,
        sub: tr('roles.' + m.role),
      }))
    : [],
)
const resources = computed(() => [...teamResources.value, ...memberResources.value])
const hasResources = computed(() => resources.value.length > 0)
// Board rows for the week grid: group headers interleaved with resources.
const boardRows = computed(() => {
  const rows = []
  if (teamResources.value.length) {
    rows.push({ group: 'teams' })
    rows.push(...teamResources.value)
  }
  if (memberResources.value.length) {
    rows.push({ group: 'members' })
    rows.push(...memberResources.value)
  }
  return rows
})

// --- date helpers live in @utils/calendar (shared with the platform board) ---
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

// Month grid: 6 weeks (42 days), Monday-first, covering the anchor month.
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

// --- data loading ---
async function reload() {
  if (mode.value === 'week') {
    await jobs.fetchRange(weekStart.value, addDaysStr(weekStart.value, 7))
  } else if (mode.value === 'month') {
    await jobs.fetchRange(monthGridStart.value, addDaysStr(monthGridStart.value, 42))
  } else {
    await jobs.fetchForDay(date.value)
  }
}
onMounted(async () => {
  // Platform staff render <platform-schedule>; don't fetch this company's data.
  if (platformView.value) return
  const loads = [teams.fetch(), reload()]
  if (canSeeMembers.value) loads.push(users.fetch({ page: 1, pageSize: 100 }))
  await Promise.all(loads)
})

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
// Day: resource key -> [jobs].
const byResource = computed(() => {
  const map = {}
  for (const j of jobs.items) (map[jobResourceKey(j)] ||= []).push(j)
  return map
})
// Week: resource key -> day string -> [jobs].
const byResourceDay = computed(() => {
  const map = {}
  for (const j of jobs.items) {
    const r = (map[jobResourceKey(j)] ||= {})
    ;(r[localDay(j.scheduled_start)] ||= []).push(j)
  }
  return map
})
// Month: day string -> [jobs].
const byDay = computed(() => {
  const map = {}
  for (const j of jobs.items) (map[localDay(j.scheduled_start)] ||= []).push(j)
  return map
})

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

function jobResourceName(j) {
  if (j.team) return j.team.name
  if (j.member) return j.member.name
  return ''
}
// Where a job happens: the site (address or label) if set, else the free-text note.
function jobPlace(j) {
  if (j.site) return j.site.address || j.site.label
  return j.location || ''
}

// --- dialog ---
const dialog = ref(false)
const editing = ref(null)
const createResourceType = ref('team')
const createResourceId = ref('')
const createDate = ref('')

function openCreate(resource, day) {
  editing.value = null
  createResourceType.value = resource ? resource.type : 'team'
  createResourceId.value = resource ? resource.id : ''
  createDate.value = day || date.value
  dialog.value = true
}
function openEdit(job) {
  if (!canManage.value) return
  editing.value = job
  createDate.value = ''
  dialog.value = true
}

async function setStatus(job, status) {
  try {
    await jobs.setStatus(job.id, status)
    await reload()
  } catch (err) {
    messages.error(err.message || tr('toast.couldNotUpdate'))
  }
}
async function remove(job) {
  try {
    await jobs.remove(job.id)
    messages.success(tr('toast.jobRemoved'))
    await reload()
  } catch (err) {
    messages.error(err.message || tr('toast.couldNotRemove'))
  }
}

const statusOptions = computed(() => [
  { value: 'scheduled', title: tr('jobDialog.markScheduled') },
  { value: 'in_progress', title: tr('jobDialog.markInProgress') },
  { value: 'completed', title: tr('jobDialog.markCompleted') },
  { value: 'cancelled', title: tr('jobDialog.cancelJob') },
])

// --- drag to reschedule (week board) ---
const dragging = ref(null)
const dragOverCell = ref('')

function onDragStart(job, ev) {
  if (!canManage.value) return
  dragging.value = job
  ev.dataTransfer.effectAllowed = 'move'
  try {
    ev.dataTransfer.setData('text/plain', String(job.id))
  } catch {
    // some browsers disallow setData outside a gesture — drag still works
  }
}
function onDragEnd() {
  dragging.value = null
  dragOverCell.value = ''
}
// Moving a job to another day keeps its time-of-day (in the company's zone) and
// its duration — so a 9:00–10:00 job dropped on Friday is 9:00–10:00 Friday, not
// shifted by the viewer's own UTC offset.
function shiftedTimes(job, dayStr) {
  const { time: tod } = splitInZone(job.scheduled_start, tz.value)
  const durMs = new Date(job.scheduled_end) - new Date(job.scheduled_start)
  const start = toUTCISO(dayStr, tod, tz.value)
  const end = new Date(new Date(start).getTime() + durMs).toISOString()
  return { start, end }
}
// The resource id a job currently targets, for the "same cell" no-op check.
function sameCell(job, resource, dayStr) {
  const cur = job.team_id ? `team:${job.team_id}` : `member:${job.member_id}`
  return cur === resource.key && localDay(job.scheduled_start) === dayStr
}
function resourcePayload(resource) {
  return resource.type === 'member' ? { member_id: resource.id } : { team_id: resource.id }
}

async function onDrop(resource, dayStr) {
  const job = dragging.value
  dragging.value = null
  dragOverCell.value = ''
  if (!job || !canManage.value || sameCell(job, resource, dayStr)) return

  const { start, end } = shiftedTimes(job, dayStr)
  try {
    await jobs.update(job.id, { ...resourcePayload(resource), scheduled_start: start, scheduled_end: end })
    messages.success(tr('toast.jobRescheduled'))
    await reload()
  } catch (err) {
    if (err.status === 409) {
      conflict.value = { job, resource, dayStr, start, end, message: err.message }
      conflictDialog.value = true
    } else {
      messages.error(err.message || tr('toast.couldNotReschedule'))
      await reload()
    }
  }
}

// --- conflict dialog ---
const conflictDialog = ref(false)
const conflict = ref(null)
const conflictDayLabel = computed(() =>
  conflict.value
    ? new Date(conflict.value.dayStr + 'T00:00:00').toLocaleDateString(dateLocale.value, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
    : '',
)
function pickAnotherTime() {
  const c = conflict.value
  conflictDialog.value = false
  editing.value = {
    ...c.job,
    team_id: c.resource.type === 'team' ? c.resource.id : null,
    member_id: c.resource.type === 'member' ? c.resource.id : null,
    scheduled_start: c.start,
    scheduled_end: c.end,
  }
  createDate.value = ''
  dialog.value = true
}
</script>

<template>
  <!-- Platform staff (superadmin / support): read-only cross-company board. -->
  <platform-schedule v-if="platformView" />

  <v-container v-else fluid class="pa-4 pa-md-6">
    <!-- Header: title + controls -->
    <div class="d-flex flex-wrap align-center mb-4" style="gap: 12px">
      <div>
        <h1 class="text-h5 font-weight-bold">{{ $t('schedule.title') }}</h1>
        <div class="text-medium-emphasis">{{ headerSubtitle }}</div>
        <div class="text-caption text-medium-emphasis d-flex align-center" style="gap: 4px">
          <v-icon icon="$schedule" size="x-small" /> {{ $t('schedule.timesShownIn', { zone: zoneLabel(tz) }) }}
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
      <v-btn icon="$refresh" variant="text" :loading="jobs.loading" @click="reload" />
      <v-btn v-if="canManage" color="primary" prepend-icon="$addNew" @click="openCreate(null, date)">
        {{ $t('schedule.newJob') }}
      </v-btn>
    </div>

    <v-alert
      v-if="!teams.loading && !hasResources"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      <template v-if="isLeaderScoped">
        {{ $t('schedule.leaderNoTeams') }}
      </template>
      <template v-else>
        {{ $t('schedule.noResources') }}
        <router-link v-if="auth.can('teams:view')" :to="{ name: 'teams' }">{{ $t('schedule.goToTeams') }}</router-link>.
      </template>
    </v-alert>

    <!-- ===================== DAY MODE ===================== -->
    <template v-if="mode === 'day' && hasResources">
      <template v-for="group in ['team', 'member']" :key="group">
        <div
          v-if="resources.some((r) => r.type === group)"
          class="text-overline text-medium-emphasis mt-2 mb-1"
        >
          {{ group === 'team' ? ('schedule.teams') : ('schedule.members') }}
        </div>
        <v-row>
          <v-col
            v-for="res in resources.filter((r) => r.type === group)"
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
                <v-card-subtitle class="text-capitalize">{{ res.sub }}</v-card-subtitle>
                <template #append>
                  <div class="d-flex align-center" style="gap: 6px">
                    <v-chip v-if="(byResource[res.key] || []).length" size="small" variant="tonal" color="secondary">
                      {{ (byResource[res.key] || []).length }}
                    </v-chip>
                    <v-btn
                      v-if="canManage"
                      icon="$addNew"
                      variant="tonal"
                      size="small"
                      color="primary"
                      @click="openCreate(res, date)"
                    />
                  </div>
                </template>
              </v-card-item>
              <v-divider />

              <v-list v-if="(byResource[res.key] || []).length" density="comfortable" lines="two">
                <template v-for="(job, i) in byResource[res.key]" :key="job.id">
                  <v-divider v-if="i > 0" inset />
                  <v-list-item :class="{ 'job-row--clickable': canManage }" @click="openEdit(job)">
                    <template #prepend>
                      <div class="text-center mr-2" style="min-width: 58px">
                        <div class="text-body-2 font-weight-bold">{{ time(job.scheduled_start) }}</div>
                        <div class="text-caption text-medium-emphasis">{{ time(job.scheduled_end) }}</div>
                      </div>
                    </template>
                    <v-list-item-title class="font-weight-medium">
                      {{ job.title }}
                      <v-chip v-if="!job.confirmed" size="x-small" color="warning" variant="tonal" class="ml-1">{{ $t('jobStatus.tentative') }}</v-chip>
                    </v-list-item-title>
                    <v-list-item-subtitle>
                      <span class="text-caption text-medium-emphasis mr-1">{{ job.reference }}</span>
                      <span v-if="job.customer">· <v-icon icon="$company" size="x-small" /> {{ job.customer.name }}</span>
                      <span v-if="jobPlace(job)">· <v-icon icon="$location" size="x-small" /> {{ jobPlace(job) }}</span>
                    </v-list-item-subtitle>
                    <template #append>
                      <div class="d-flex align-center" style="gap: 8px">
                        <job-status-chip :status="job.status" />
                        <v-menu v-if="canManage">
                          <template #activator="{ props }">
                            <v-btn icon="$menu" variant="text" size="small" v-bind="props" @click.stop />
                          </template>
                          <v-list density="compact">
                            <v-list-item :title="$t('common.edit')" prepend-icon="$edit" @click="openEdit(job)" />
                            <v-divider />
                            <v-list-item
                              v-for="opt in statusOptions"
                              :key="opt.value"
                              :title="opt.title"
                              :disabled="job.status === opt.value"
                              @click="setStatus(job, opt.value)"
                            />
                            <v-divider />
                            <v-list-item :title="$t('common.delete')" prepend-icon="$delete" base-color="error" @click="remove(job)" />
                          </v-list>
                        </v-menu>
                      </div>
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

    <!-- ===================== WEEK MODE ===================== -->
    <v-card v-else-if="mode === 'week' && hasResources" rounded="lg" variant="outlined">
      <template v-if="canManage">
        <div class="px-4 py-2 text-caption text-medium-emphasis d-flex align-center" style="gap: 6px">
          <v-icon icon="$viewWeek" size="x-small" /> {{ $t('schedule.dragHint') }}
        </div>
        <v-divider />
      </template>
      <div class="week-scroll">
        <div class="week-grid">
          <!-- header row -->
          <div class="week-corner">{{ $t('schedule.resource') }}</div>
          <div v-for="d in weekDays" :key="d.str" class="week-head" :class="{ 'week-today': d.isToday }">
            <div class="font-weight-bold">{{ d.weekday }}</div>
            <div class="text-caption text-medium-emphasis">{{ d.label }}</div>
          </div>

          <!-- rows: group headers + resources -->
          <template v-for="row in boardRows" :key="row.group || row.key">
            <div v-if="row.group" class="week-group">{{ $t('schedule.' + row.group) }}</div>
            <template v-else>
              <div class="week-res">
                <div class="d-flex align-center">
                  <v-icon :icon="resourceIcon(row.type)" size="small" class="mr-2 text-medium-emphasis" />
                  <div style="min-width: 0">
                    <div class="font-weight-medium text-truncate">{{ row.name }}</div>
                    <div class="text-caption text-medium-emphasis text-truncate text-capitalize">{{ row.sub }}</div>
                  </div>
                </div>
              </div>
              <div
                v-for="d in weekDays"
                :key="row.key + '-' + d.str"
                class="week-cell"
                :class="{
                  'week-today-cell': d.isToday,
                  'week-cell--over': dragging && dragOverCell === row.key + '-' + d.str,
                }"
                @dragover.prevent="dragOverCell = row.key + '-' + d.str"
                @drop.prevent="onDrop(row, d.str)"
              >
                <div
                  v-for="job in (byResourceDay[row.key] && byResourceDay[row.key][d.str]) || []"
                  :key="job.id"
                  class="week-job"
                  :style="{ '--sc': statusColor[job.status] }"
                  :class="{
                    'week-job--cancelled': job.status === 'cancelled',
                    'week-job--tentative': !job.confirmed,
                    clickable: canManage,
                    'week-job--dragging': dragging && dragging.id === job.id,
                  }"
                  :draggable="canManage"
                  :title="`${time(job.scheduled_start)} · ${job.title}${job.confirmed ? '' : ' (tentative)'}`"
                  @click="openEdit(job)"
                  @dragstart="onDragStart(job, $event)"
                  @dragend="onDragEnd"
                >
                  <div class="week-job-time">{{ time(job.scheduled_start) }}</div>
                  <div class="week-job-title text-truncate">{{ job.title }}</div>
                </div>
                <v-btn
                  v-if="canManage"
                  class="week-add"
                  size="x-small"
                  variant="text"
                  icon="$addNew"
                  @click="openCreate(row, d.str)"
                />
              </div>
            </template>
          </template>
        </div>
      </div>
    </v-card>

    <!-- ===================== MONTH MODE ===================== -->
    <v-card v-else-if="mode === 'month' && hasResources" rounded="lg" variant="outlined">
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
          @click="canManage && openCreate(null, d.str)"
        >
          <div class="month-daynum" :class="{ 'font-weight-bold': d.isToday }">{{ d.dayNum }}</div>
          <div
            v-for="job in ((byDay[d.str] || []).slice(0, 4))"
            :key="job.id"
            class="month-job text-truncate"
            :style="{ '--sc': statusColor[job.status] }"
            :class="{ 'week-job--tentative': !job.confirmed, 'week-job--cancelled': job.status === 'cancelled' }"
            :title="`${time(job.scheduled_start)} · ${jobResourceName(job)} · ${job.title}`"
            @click.stop="openEdit(job)"
          >
            <span class="month-job-time">{{ time(job.scheduled_start) }}</span> {{ job.title }}
          </div>
          <div v-if="(byDay[d.str] || []).length > 4" class="text-caption text-medium-emphasis px-1">
            {{ $t('schedule.moreCount', { count: (byDay[d.str] || []).length - 4 }) }}
          </div>
        </div>
      </div>
    </v-card>

    <job-dialog
      v-model="dialog"
      :job="editing"
      :teams="visibleTeams"
      :members="canSeeMembers ? users.items : []"
      :default-date="createDate || date"
      :default-resource-type="createResourceType"
      :default-resource-id="createResourceId"
      @saved="reload"
    />

    <!-- Raised when a drag-to-reschedule would double-book the resource. -->
    <v-dialog v-model="conflictDialog" max-width="480">
      <v-card v-if="conflict" rounded="lg">
        <v-card-title class="d-flex align-center pa-4">
          <v-icon icon="$alert" color="warning" class="mr-2" />
          {{ $t('schedule.conflictTitle') }}
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <p class="mb-3">
            {{ $t('schedule.conflictBody', { name: conflict.resource.name, day: conflictDayLabel, title: conflict.job.title }) }}
          </p>
          <v-alert type="warning" variant="tonal" density="compact">{{ conflict.message }}</v-alert>
          <p class="text-medium-emphasis mt-3 mb-0">
            {{ $t('schedule.conflictHint') }}
          </p>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="conflictDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" prepend-icon="$scheduled" @click="pickAnotherTime">
            {{ $t('schedule.pickAnotherTime') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
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
/* Full-width group separator row. */
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
.week-cell--over {
  background: rgba(var(--v-theme-primary), 0.1);
  outline: 2px dashed rgba(var(--v-theme-primary), 0.55);
  outline-offset: -2px;
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
.week-job[draggable='true'] {
  cursor: grab;
}
.week-job[draggable='true']:active {
  cursor: grabbing;
}
.week-job--dragging {
  opacity: 0.4;
}
.week-job--cancelled {
  opacity: 0.6;
}
.week-job--cancelled .week-job-title {
  text-decoration: line-through;
}
/* Tentative jobs read as penciled-in: dashed border, no solid fill. */
.week-job--tentative {
  border-left-style: dashed;
  background: transparent;
  outline: 1px dashed color-mix(in srgb, var(--sc) 55%, transparent);
  outline-offset: -1px;
}
.week-add {
  opacity: 0;
  position: absolute;
  bottom: 2px;
  right: 2px;
  transition: opacity 0.15s;
}
.week-cell:hover .week-add {
  opacity: 1;
}

/* ── Month grid ── */
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
  cursor: pointer;
  transition: background 0.12s;
}
.month-cell:hover {
  background: rgba(var(--v-theme-primary), 0.03);
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
.month-job-time {
  font-weight: 700;
}
</style>
