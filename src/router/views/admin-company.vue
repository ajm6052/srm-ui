<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminStore } from '@stores/admin'
import { useMessagesStore } from '@stores/messages'
import { useAuthStore } from '@stores/auth'
import JobStatusChip from '@components/job-status-chip.vue'

const props = defineProps({ id: { type: Number, required: true } })
const admin = useAdminStore()
const messages = useMessagesStore()
const auth = useAuthStore()
const { t } = useI18n({ useScope: 'global' })

const company = ref(null)
const tab = ref('users')

const ROLES = computed(() => [
  { value: 'owner', title: t('roles.owner') },
  { value: 'admin', title: t('roles.admin') },
  { value: 'scheduler', title: t('roles.scheduler') },
  { value: 'team_leader', title: t('roles.team_leader') },
  { value: 'member', title: t('roles.member') },
])
const roleColor = { owner: 'deep-purple', admin: 'indigo', scheduler: 'primary', team_leader: 'teal', member: 'blue-grey' }
const canManageOwners = computed(() => auth.isSuperAdmin)

async function loadCompany() {
  try {
    company.value = await admin.getCompany(props.id)
  } catch (err) {
    messages.error(err.message)
  }
}
onMounted(async () => {
  await Promise.all([loadCompany(), loadUsers(), loadTeams(), loadJobs()])
})

// ─── Users ───────────────────────────────────────────────────────────────────
const users = ref([])
async function loadUsers() {
  try {
    // Load a bounded window (also feeds the team leader/member pickers below, so
    // we fetch up to the server's max page rather than paging here).
    const { data } = await admin.companyUsers(props.id, { page: 1, page_size: 100 })
    users.value = data || []
  } catch (err) {
    messages.error(err.message)
  }
}
const userDialog = ref(false)
const editingUser = ref(null)
const userForm = ref(blankUser())
const savingUser = ref(false)
function blankUser() {
  return { name: '', email: '', password: '', role: 'member', is_active: true }
}
function openUserCreate() {
  editingUser.value = null
  userForm.value = blankUser()
  userDialog.value = true
}
function openUserEdit(u) {
  editingUser.value = u
  userForm.value = { name: u.name, email: u.email, password: '', role: u.role, is_active: u.is_active }
  userDialog.value = true
}
async function saveUser() {
  savingUser.value = true
  try {
    if (editingUser.value) {
      await admin.updateCompanyUser(props.id, editingUser.value.id, {
        name: userForm.value.name,
        role: userForm.value.role,
        is_active: userForm.value.is_active,
      })
      messages.success(t('admin.userUpdated'))
    } else {
      await admin.createCompanyUser(props.id, {
        name: userForm.value.name,
        email: userForm.value.email,
        password: userForm.value.password,
        role: userForm.value.role,
      })
      messages.success(t('admin.userAdded'))
    }
    userDialog.value = false
    await loadUsers()
  } catch (err) {
    if (err.status === 403) messages.error(t('admin.onlySuperOwner'))
    else if (err.status === 409) messages.error(t('admin.emailInUseOwner'))
    else if (err.status === 400) messages.error(t('admin.checkPassword'))
    else messages.error(err.message)
  } finally {
    savingUser.value = false
  }
}
const pwDialog = ref(false)
const pwUser = ref(null)
const pwValue = ref('')
function openPassword(u) {
  pwUser.value = u
  pwValue.value = ''
  pwDialog.value = true
}
async function savePassword() {
  try {
    await admin.setCompanyUserPassword(props.id, pwUser.value.id, pwValue.value)
    messages.success(t('admin.passwordReset'))
    pwDialog.value = false
  } catch (err) {
    if (err.status === 403) messages.error(t('admin.onlySuperResetOwner'))
    else messages.error(err.message)
  }
}

// ─── Teams ───────────────────────────────────────────────────────────────────
const teams = ref([])
async function loadTeams() {
  try {
    const { data } = await admin.companyTeams(props.id)
    teams.value = data || []
  } catch (err) {
    messages.error(err.message)
  }
}
const userOptions = computed(() => users.value.map((u) => ({ id: u.id, name: `${u.name} (${t('roles.' + u.role)})` })))

const teamDialog = ref(false)
const editingTeam = ref(null)
const teamForm = ref({ name: '', leader_id: null })
function openTeamCreate() {
  editingTeam.value = null
  teamForm.value = { name: '', leader_id: null }
  teamDialog.value = true
}
function openTeamEdit(team) {
  editingTeam.value = team
  teamForm.value = { name: team.name, leader_id: team.leader_id }
  teamDialog.value = true
}
async function saveTeam() {
  if (!teamForm.value.name) return
  try {
    if (editingTeam.value) await admin.updateCompanyTeam(props.id, editingTeam.value.id, teamForm.value)
    else await admin.createCompanyTeam(props.id, teamForm.value)
    messages.success(t('admin.teamSaved'))
    teamDialog.value = false
    await loadTeams()
  } catch (err) {
    messages.error(err.status === 409 ? t('admin.teamNameExists') : err.message)
  }
}
async function deleteTeam(team) {
  try {
    await admin.deleteCompanyTeam(props.id, team.id)
    messages.success(t('admin.teamDeleted'))
    await loadTeams()
  } catch (err) {
    messages.error(err.message)
  }
}
const membersDialog = ref(false)
const rosterTeam = ref(null)
const addUserId = ref(null)
async function openMembers(team) {
  rosterTeam.value = await admin.getCompanyTeam(props.id, team.id)
  addUserId.value = null
  membersDialog.value = true
}
const addableUsers = computed(() => {
  const have = new Set((rosterTeam.value?.members || []).map((m) => m.id))
  return userOptions.value.filter((u) => !have.has(u.id))
})
async function addMember() {
  if (!addUserId.value) return
  try {
    rosterTeam.value = await admin.addCompanyTeamMember(props.id, rosterTeam.value.id, addUserId.value)
    addUserId.value = null
    await loadTeams()
  } catch (err) {
    messages.error(err.status === 409 ? t('admin.alreadyOnTeam') : err.message)
  }
}
async function removeMember(userId) {
  try {
    rosterTeam.value = await admin.removeCompanyTeamMember(props.id, rosterTeam.value.id, userId)
    await loadTeams()
  } catch (err) {
    messages.error(err.message)
  }
}

// ─── Schedule ────────────────────────────────────────────────────────────────
const jobs = ref([])
const date = ref(todayStr())
function pad(n) {
  return String(n).padStart(2, '0')
}
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
async function loadJobs() {
  try {
    const next = new Date(date.value + 'T00:00:00')
    next.setDate(next.getDate() + 1)
    const { data } = await admin.companyJobs(props.id, { from: date.value, to: next.toISOString().slice(0, 10) })
    jobs.value = data || []
  } catch (err) {
    messages.error(err.message)
  }
}
const jobsByTeam = computed(() => {
  const map = {}
  for (const j of jobs.value) (map[j.team_id] ||= []).push(j)
  return map
})
function time(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const jobDialog = ref(false)
const editingJob = ref(null)
const jobForm = ref(blankJob())
const savingJob = ref(false)
function blankJob() {
  return { team_id: '', title: '', description: '', location: '', date: date.value, start: '09:00', end: '10:00' }
}
function splitLocal(iso) {
  const d = new Date(iso)
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}
function toISO(d, t) {
  return new Date(`${d}T${t}:00`).toISOString()
}
function openJobCreate(teamId) {
  editingJob.value = null
  jobForm.value = { ...blankJob(), team_id: teamId || '', date: date.value }
  jobDialog.value = true
}
function openJobEdit(job) {
  editingJob.value = job
  const s = splitLocal(job.scheduled_start)
  const e = splitLocal(job.scheduled_end)
  jobForm.value = { team_id: job.team_id, title: job.title, description: job.description || '', location: job.location || '', date: s.date, start: s.time, end: e.time }
  jobDialog.value = true
}
async function saveJob() {
  if (!jobForm.value.team_id || !jobForm.value.title) {
    messages.error(t('admin.teamTitleRequired'))
    return
  }
  const payload = {
    team_id: Number(jobForm.value.team_id),
    title: jobForm.value.title,
    description: jobForm.value.description,
    location: jobForm.value.location,
    scheduled_start: toISO(jobForm.value.date, jobForm.value.start),
    scheduled_end: toISO(jobForm.value.date, jobForm.value.end),
  }
  savingJob.value = true
  try {
    if (editingJob.value) await admin.updateCompanyJob(props.id, editingJob.value.id, payload)
    else await admin.createCompanyJob(props.id, payload)
    messages.success(t('admin.jobSaved'))
    jobDialog.value = false
    await loadJobs()
  } catch (err) {
    if (err.status === 409) messages.error(err.message)
    else if (err.status === 400) messages.error(t('jobDialog.checkTimes'))
    else messages.error(err.message)
  } finally {
    savingJob.value = false
  }
}
async function setJobStatus(job, status) {
  try {
    await admin.setCompanyJobStatus(props.id, job.id, status)
    await loadJobs()
  } catch (err) {
    messages.error(err.message)
  }
}
async function deleteJob(job) {
  try {
    await admin.deleteCompanyJob(props.id, job.id)
    messages.success(t('admin.jobRemoved'))
    await loadJobs()
  } catch (err) {
    messages.error(err.message)
  }
}
const jobStatusOptions = computed(() => [
  { value: 'scheduled', title: t('jobDialog.markScheduled') },
  { value: 'in_progress', title: t('jobDialog.markInProgress') },
  { value: 'completed', title: t('jobDialog.markCompleted') },
  { value: 'cancelled', title: t('jobDialog.cancelJob') },
])
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <!-- Header -->
    <div class="d-flex flex-wrap align-center mb-4" style="gap: 12px">
      <v-btn icon="$back" variant="text" :to="{ name: 'admin' }" />
      <v-avatar color="secondary" variant="tonal"><v-icon icon="$company" /></v-avatar>
      <div>
        <h1 class="text-h5 font-weight-bold d-flex align-center" style="gap: 8px">
          {{ company?.name || $t('admin.companyFallback') }}
          <v-chip v-if="company" size="x-small" :color="company.status === 'active' ? 'success' : 'grey'" variant="tonal">
            {{ company.status === 'active' ? $t('admin.active') : $t('admin.suspended') }}
          </v-chip>
        </h1>
        <div class="text-medium-emphasis">
          <v-chip size="x-small" color="deep-purple" variant="tonal" class="mr-1">
            <v-icon :icon="auth.isSuperAdmin ? '$superadmin' : '$admin'" start size="12" />
            {{ $t('admin.toolsLabel', { role: auth.isSuperAdmin ? $t('admin.superadminWord') : $t('admin.supportWord') }) }}
          </v-chip>
          {{ $t('admin.auditNote') }}
        </div>
      </div>
    </div>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="users" prepend-icon="$users">{{ $t('admin.tabs.users') }}<v-chip size="x-small" class="ml-2" variant="tonal">{{ users.length }}</v-chip></v-tab>
      <v-tab value="teams" prepend-icon="$teams">{{ $t('admin.tabs.teams') }}<v-chip size="x-small" class="ml-2" variant="tonal">{{ teams.length }}</v-chip></v-tab>
      <v-tab value="schedule" prepend-icon="$schedule">{{ $t('admin.tabs.schedule') }}</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- USERS -->
      <v-window-item value="users">
        <div class="d-flex mb-3">
          <v-spacer />
          <v-btn color="primary" prepend-icon="$addNew" @click="openUserCreate">{{ $t('admin.addUser') }}</v-btn>
        </div>
        <v-card rounded="lg" variant="outlined">
          <v-table>
            <thead>
              <tr><th>{{ $t('common.name') }}</th><th>{{ $t('common.email') }}</th><th>{{ $t('common.role') }}</th><th>{{ $t('common.status') }}</th><th class="text-end">{{ $t('admin.colActions') }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.id">
                <td class="font-weight-medium">{{ u.name }}</td>
                <td class="text-medium-emphasis">{{ u.email }}</td>
                <td><v-chip size="small" :color="roleColor[u.role]" variant="tonal">{{ $t('roles.' + u.role) }}</v-chip></td>
                <td><v-chip size="small" :color="u.is_active ? 'success' : 'grey'" variant="tonal">{{ u.is_active ? $t('common.active') : $t('common.inactive') }}</v-chip></td>
                <td class="text-end">
                  <v-btn size="small" variant="text" icon="$edit" @click="openUserEdit(u)" />
                  <v-btn size="small" variant="text" icon="$key" @click="openPassword(u)" />
                </td>
              </tr>
              <tr v-if="!users.length"><td colspan="5" class="text-center text-medium-emphasis py-8">{{ $t('admin.noUsers') }}</td></tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>

      <!-- TEAMS -->
      <v-window-item value="teams">
        <div class="d-flex mb-3">
          <v-spacer />
          <v-btn color="primary" prepend-icon="$addNew" @click="openTeamCreate">{{ $t('admin.newTeam') }}</v-btn>
        </div>
        <v-row>
          <v-col v-for="t in teams" :key="t.id" cols="12" sm="6" lg="4">
            <v-card rounded="lg" variant="outlined">
              <v-card-item>
                <template #prepend><v-avatar color="secondary" variant="tonal"><v-icon icon="$teams" /></v-avatar></template>
                <v-card-title>{{ t.name }}</v-card-title>
                <v-card-subtitle><v-icon icon="$leader" size="x-small" /> {{ t.leader ? t.leader.name : $t('admin.noLeader') }}</v-card-subtitle>
              </v-card-item>
              <v-card-text><v-chip size="small" variant="tonal" prepend-icon="$members">{{ $t('admin.memberCount', t.member_count) }}</v-chip></v-card-text>
              <v-divider />
              <v-card-actions>
                <v-btn variant="text" prepend-icon="$members" @click="openMembers(t)">{{ $t('admin.members') }}</v-btn>
                <v-spacer />
                <v-btn icon="$edit" variant="text" size="small" @click="openTeamEdit(t)" />
                <v-btn icon="$delete" variant="text" size="small" color="error" @click="deleteTeam(t)" />
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
        <v-alert v-if="!teams.length" type="info" variant="tonal">{{ $t('admin.noTeamsYet') }}</v-alert>
      </v-window-item>

      <!-- SCHEDULE -->
      <v-window-item value="schedule">
        <div class="d-flex flex-wrap align-center mb-3" style="gap: 8px">
          <v-text-field v-model="date" type="date" variant="outlined" density="compact" hide-details style="max-width: 180px" @update:model-value="loadJobs" />
          <v-spacer />
          <v-btn color="primary" prepend-icon="$addNew" @click="openJobCreate('')">{{ $t('admin.newJob') }}</v-btn>
        </div>
        <v-alert v-if="!teams.length" type="info" variant="tonal">{{ $t('admin.createTeamFirst') }}</v-alert>
        <v-row>
          <v-col v-for="t in teams" :key="t.id" cols="12" md="6" lg="4">
            <v-card rounded="lg" variant="outlined" class="h-100">
              <v-card-item>
                <template #prepend><v-avatar color="secondary" size="36"><v-icon icon="$teams" /></v-avatar></template>
                <v-card-title class="text-subtitle-1">{{ t.name }}</v-card-title>
                <template #append><v-btn icon="$addNew" variant="tonal" size="small" color="primary" @click="openJobCreate(t.id)" /></template>
              </v-card-item>
              <v-divider />
              <v-list v-if="(jobsByTeam[t.id] || []).length" density="comfortable" lines="two">
                <v-list-item v-for="job in jobsByTeam[t.id]" :key="job.id">
                  <template #prepend>
                    <div class="text-center mr-2" style="min-width: 54px">
                      <div class="text-body-2 font-weight-bold">{{ time(job.scheduled_start) }}</div>
                      <div class="text-caption text-medium-emphasis">{{ time(job.scheduled_end) }}</div>
                    </div>
                  </template>
                  <v-list-item-title class="font-weight-medium">{{ job.title }}</v-list-item-title>
                  <v-list-item-subtitle>{{ job.reference }}</v-list-item-subtitle>
                  <template #append>
                    <div class="d-flex align-center" style="gap: 6px">
                      <job-status-chip :status="job.status" />
                      <v-menu>
                        <template #activator="{ props: p }">
                          <v-btn icon="$menu" variant="text" size="small" v-bind="p" />
                        </template>
                        <v-list density="compact">
                          <v-list-item :title="$t('common.edit')" prepend-icon="$edit" @click="openJobEdit(job)" />
                          <v-divider />
                          <v-list-item v-for="o in jobStatusOptions" :key="o.value" :title="o.title" :disabled="job.status === o.value" @click="setJobStatus(job, o.value)" />
                          <v-divider />
                          <v-list-item :title="$t('common.delete')" prepend-icon="$delete" base-color="error" @click="deleteJob(job)" />
                        </v-list>
                      </v-menu>
                    </div>
                  </template>
                </v-list-item>
              </v-list>
              <v-card-text v-else class="text-center text-medium-emphasis py-6">{{ $t('admin.noJobsThisDay') }}</v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>
    </v-window>

    <!-- User dialog -->
    <v-dialog v-model="userDialog" max-width="480">
      <v-card rounded="lg">
        <v-card-title class="pa-4">{{ editingUser ? $t('admin.editUser') : $t('admin.addUser') }}</v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <v-text-field v-model="userForm.name" :label="$t('common.name')" prepend-inner-icon="$account" variant="outlined" />
          <v-text-field v-model="userForm.email" :label="$t('common.email')" type="email" variant="outlined" :disabled="!!editingUser" :hint="editingUser ? $t('users.emailImmutable') : ''" :persistent-hint="!!editingUser" />
          <v-text-field v-if="!editingUser" v-model="userForm.password" :label="$t('users.password')" type="password" :hint="$t('users.passwordHint')" variant="outlined" />
          <v-select v-model="userForm.role" :items="ROLES" :label="$t('common.role')" variant="outlined" :hint="canManageOwners ? '' : $t('admin.ownerHint')" persistent-hint />
          <v-switch v-if="editingUser" v-model="userForm.is_active" :label="userForm.is_active ? $t('common.active') : $t('common.inactive')" color="success" hide-details />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" :disabled="savingUser" @click="userDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="savingUser" @click="saveUser">{{ $t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Password dialog -->
    <v-dialog v-model="pwDialog" max-width="420">
      <v-card rounded="lg">
        <v-card-title class="pa-4">{{ $t('admin.resetPassword') }}</v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <div class="text-body-2 text-medium-emphasis mb-3">
            <i18n-t keypath="admin.newPasswordFor" tag="span">
              <template #name><strong>{{ pwUser?.name }}</strong></template>
            </i18n-t>
          </div>
          <v-text-field v-model="pwValue" :label="$t('admin.newPassword')" type="password" :hint="$t('users.passwordHint')" variant="outlined" autofocus />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="pwDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :disabled="pwValue.length < 8" @click="savePassword">{{ $t('admin.reset') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Team dialog -->
    <v-dialog v-model="teamDialog" max-width="480">
      <v-card rounded="lg">
        <v-card-title class="pa-4">{{ editingTeam ? $t('teams.editTeam') : $t('admin.newTeam') }}</v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <v-text-field v-model="teamForm.name" :label="$t('teams.teamName')" prepend-inner-icon="$teams" variant="outlined" autofocus />
          <v-select v-model="teamForm.leader_id" :items="userOptions" item-title="name" item-value="id" :label="$t('teams.leaderOptional')" prepend-inner-icon="$leader" variant="outlined" clearable />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="teamDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" @click="saveTeam">{{ $t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Members dialog -->
    <v-dialog v-model="membersDialog" max-width="520">
      <v-card v-if="rosterTeam" rounded="lg">
        <v-card-title class="pa-4">{{ $t('admin.membersOf', { name: rosterTeam.name }) }}</v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <div class="d-flex align-center mb-3" style="gap: 8px">
            <v-select v-model="addUserId" :items="addableUsers" item-title="name" item-value="id" :label="$t('teams.addUser')" variant="outlined" density="comfortable" hide-details />
            <v-btn color="primary" icon="$addNew" :disabled="!addUserId" @click="addMember" />
          </div>
          <v-list v-if="rosterTeam.members && rosterTeam.members.length" density="comfortable">
            <v-list-item v-for="m in rosterTeam.members" :key="m.id" :title="m.name" :subtitle="m.email">
              <template #prepend><v-avatar color="grey-lighten-1"><v-icon icon="$account" /></v-avatar></template>
              <template #append><v-btn icon="$close" variant="text" size="small" @click="removeMember(m.id)" /></template>
            </v-list-item>
          </v-list>
          <div v-else class="text-center text-medium-emphasis py-6">{{ $t('admin.noMembersYet') }}</div>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3"><v-spacer /><v-btn variant="text" @click="membersDialog = false">{{ $t('common.close') }}</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Job dialog -->
    <v-dialog v-model="jobDialog" max-width="560">
      <v-card rounded="lg">
        <v-card-title class="pa-4">{{ editingJob ? $t('admin.editJob') : $t('admin.scheduleJob') }}</v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <v-select v-model="jobForm.team_id" :items="teams" item-title="name" item-value="id" :label="$t('jobDialog.team')" prepend-inner-icon="$teams" variant="outlined" />
          <v-text-field v-model="jobForm.title" :label="$t('jobDialog.title')" prepend-inner-icon="$job" variant="outlined" />
          <v-textarea v-model="jobForm.description" :label="$t('jobDialog.description')" variant="outlined" rows="2" auto-grow />
          <v-text-field v-model="jobForm.location" :label="$t('admin.location')" prepend-inner-icon="$location" variant="outlined" />
          <v-row dense>
            <v-col cols="12" sm="4"><v-text-field v-model="jobForm.date" :label="$t('jobDialog.date')" type="date" variant="outlined" /></v-col>
            <v-col cols="6" sm="4"><v-text-field v-model="jobForm.start" :label="$t('jobDialog.start')" type="time" variant="outlined" /></v-col>
            <v-col cols="6" sm="4"><v-text-field v-model="jobForm.end" :label="$t('jobDialog.end')" type="time" variant="outlined" /></v-col>
          </v-row>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" :disabled="savingJob" @click="jobDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="savingJob" @click="saveJob">{{ editingJob ? $t('common.save') : $t('admin.scheduleAction') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
