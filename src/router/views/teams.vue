<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTeamsStore } from '@stores/teams'
import { useUsersStore } from '@stores/users'
import { useAuthStore } from '@stores/auth'
import { useMessagesStore } from '@stores/messages'
import { useCrossCompany } from '@src/composables/useCrossCompany'
import CompanyFilter from '@components/company-filter.vue'

const teams = useTeamsStore()
const users = useUsersStore()
const auth = useAuthStore()
const messages = useMessagesStore()
const { t } = useI18n({ useScope: 'global' })

// Cross-company (platform operator) mode: read-only grid spanning companies.
const { cross, companyId, companies, mergeCompanies } = useCrossCompany()

const canManage = computed(() => auth.can('teams:manage') && !cross.value)

async function load() {
  await teams.fetch({ companyId: companyId.value })
  if (cross.value) mergeCompanies(teams.items.map((tm) => tm.company).filter(Boolean))
}

onMounted(() => {
  load()
  // The leader / add-member pickers are single-company only, so skip loading users
  // in the read-only cross-company view.
  if (!cross.value && auth.can('users:view')) users.fetch()
})
watch(companyId, load)

// User pick-list for the leader select and add-member menu.
const userOptions = computed(() =>
  users.items.map((u) => ({ id: u.id, name: `${u.name} (${t('roles.' + u.role)})` })),
)
function userName(id) {
  return users.items.find((u) => u.id === id)?.name || `User #${id}`
}

// --- create / edit dialog ---
const editDialog = ref(false)
const editing = ref(null)
const form = ref({ name: '', leader_id: null })

function openCreate() {
  editing.value = null
  form.value = { name: '', leader_id: null }
  editDialog.value = true
}
function openEdit(team) {
  editing.value = team
  form.value = { name: team.name, leader_id: team.leader_id }
  editDialog.value = true
}
async function saveTeam() {
  if (!form.value.name) {
    messages.error(t('teams.nameRequired'))
    return
  }
  try {
    if (editing.value) {
      await teams.update(editing.value.id, form.value)
      messages.success(t('teams.updated'))
    } else {
      await teams.create(form.value)
      messages.success(t('teams.created'))
    }
    editDialog.value = false
    await teams.fetch()
  } catch (err) {
    messages.error(err.status === 409 ? t('teams.nameExists') : err.message)
  }
}
async function removeTeam(team) {
  try {
    await teams.remove(team.id)
    messages.success(t('teams.deleted'))
    await teams.fetch()
  } catch (err) {
    messages.error(err.message)
  }
}

// --- members dialog ---
const membersDialog = ref(false)
const rosterTeam = ref(null)
const addUserId = ref(null)

async function openMembers(team) {
  // Reload the team to get its full roster (list view carries only a count).
  rosterTeam.value = await teams.get(team.id)
  addUserId.value = null
  membersDialog.value = true
}
async function addMember() {
  if (!addUserId.value) return
  try {
    rosterTeam.value = await teams.addMember(rosterTeam.value.id, addUserId.value)
    addUserId.value = null
    await teams.fetch()
  } catch (err) {
    messages.error(err.status === 409 ? t('teams.alreadyOnTeam') : err.message)
  }
}
async function removeMember(userId) {
  try {
    rosterTeam.value = await teams.removeMember(rosterTeam.value.id, userId)
    await teams.fetch()
  } catch (err) {
    messages.error(err.message)
  }
}
// Users not already on the roster, for the add-member select.
const addableUsers = computed(() => {
  const have = new Set((rosterTeam.value?.members || []).map((m) => m.id))
  return userOptions.value.filter((u) => !have.has(u.id))
})
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <div class="d-flex align-center mb-4 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold">{{ $t('teams.title') }}</h1>
        <div class="text-medium-emphasis">{{ $t('teams.subtitle') }}</div>
      </div>
      <v-chip v-if="cross" size="small" color="deep-purple" variant="tonal" prepend-icon="$admin">
        {{ $t('common.crossCompanyReadOnly') }}
      </v-chip>
      <v-spacer />
      <company-filter v-if="cross" v-model="companyId" :companies="companies" />
      <v-btn v-if="canManage" color="primary" prepend-icon="$addNew" @click="openCreate">{{ $t('teams.newTeam') }}</v-btn>
    </div>

    <v-progress-linear v-if="teams.loading" indeterminate color="primary" class="mb-4" />

    <v-row v-if="teams.items.length">
      <v-col v-for="team in teams.items" :key="team.id" cols="12" sm="6" lg="4">
        <v-card rounded="lg" variant="outlined">
          <v-card-item>
            <template #prepend>
              <v-avatar color="secondary"><v-icon icon="$teams" /></v-avatar>
            </template>
            <v-card-title>{{ team.name }}</v-card-title>
            <v-card-subtitle>
              <v-icon icon="$leader" size="x-small" />
              {{ team.leader ? team.leader.name : $t('teams.noLeaderAssigned') }}
            </v-card-subtitle>
          </v-card-item>
          <v-card-text class="d-flex flex-wrap ga-2">
            <v-chip size="small" variant="tonal" prepend-icon="$members">
              {{ $t('teams.memberCount', team.member_count) }}
            </v-chip>
            <v-chip v-if="cross && team.company" size="small" color="indigo" variant="tonal" prepend-icon="$company">
              {{ team.company.name }}
            </v-chip>
          </v-card-text>
          <template v-if="!cross">
            <v-divider />
            <v-card-actions>
              <v-btn variant="text" prepend-icon="$members" @click="openMembers(team)">
                {{ (canManage ? $t('teams.manage') : $t('teams.view')) + ' ' + $t('teams.membersWord') }}
              </v-btn>
              <v-spacer />
              <template v-if="canManage">
                <v-btn icon="$edit" variant="text" size="small" @click="openEdit(team)" />
                <v-btn icon="$delete" variant="text" size="small" color="error" @click="removeTeam(team)" />
              </template>
            </v-card-actions>
          </template>
        </v-card>
      </v-col>
    </v-row>

    <v-alert v-if="!teams.loading && !teams.items.length" type="info" variant="tonal">
      {{ $t('teams.empty') }}<span v-if="canManage"> {{ $t('teams.emptyHint') }}</span>
    </v-alert>

    <!-- create / edit -->
    <v-dialog v-model="editDialog" max-width="480">
      <v-card rounded="lg">
        <v-card-title class="pa-4">{{ editing ? $t('teams.editTeam') : $t('teams.newTeam') }}</v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <v-text-field v-model="form.name" :label="$t('teams.teamName')" prepend-inner-icon="$teams" variant="outlined" autofocus />
          <v-select
            v-model="form.leader_id"
            :items="userOptions"
            item-title="name"
            item-value="id"
            :label="$t('teams.leaderOptional')"
            prepend-inner-icon="$leader"
            variant="outlined"
            clearable
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="editDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" @click="saveTeam">{{ $t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- members -->
    <v-dialog v-model="membersDialog" max-width="520">
      <v-card v-if="rosterTeam" rounded="lg">
        <v-card-title class="pa-4">{{ $t('teams.membersOf', { name: rosterTeam.name }) }}</v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <div v-if="canManage" class="d-flex align-center mb-3" style="gap: 8px">
            <v-select
              v-model="addUserId"
              :items="addableUsers"
              item-title="name"
              item-value="id"
              :label="$t('teams.addUser')"
              variant="outlined"
              density="comfortable"
              hide-details
            />
            <v-btn color="primary" icon="$addNew" :disabled="!addUserId" @click="addMember" />
          </div>

          <v-list v-if="rosterTeam.members && rosterTeam.members.length" density="comfortable">
            <v-list-item v-for="m in rosterTeam.members" :key="m.id" :title="m.name" :subtitle="m.email">
              <template #prepend><v-avatar color="grey-lighten-1"><v-icon icon="$account" /></v-avatar></template>
              <template #append>
                <v-btn
                  v-if="canManage"
                  icon="$close"
                  variant="text"
                  size="small"
                  @click="removeMember(m.id)"
                />
              </template>
            </v-list-item>
          </v-list>
          <div v-else class="text-center text-medium-emphasis py-6">{{ $t('teams.noMembers') }}</div>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="membersDialog = false">{{ $t('common.close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
