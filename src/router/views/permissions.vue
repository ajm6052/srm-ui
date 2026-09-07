<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '@utils/api'
import { useMessagesStore } from '@stores/messages'

const { t } = useI18n({ useScope: 'global' })
const messages = useMessagesStore()

// Map each backend permission key (e.g. "users:view") to a safe i18n subkey, so
// the label paths never contain a colon.
const PERM_KEY = {
  'company:manage': 'companyManage',
  'users:view': 'usersView',
  'users:manage': 'usersManage',
  'teams:view': 'teamsView',
  'teams:manage': 'teamsManage',
  'jobs:view': 'jobsView',
  'jobs:manage': 'jobsManage',
  'customers:view': 'customersView',
  'customers:manage': 'customersManage',
  'reports:view': 'reportsView',
  'support:view': 'supportView',
  'support:create': 'supportCreate',
  'support:manage': 'supportManage',
}

const roleColor = {
  owner: 'deep-purple',
  admin: 'indigo',
  scheduler: 'primary',
  team_leader: 'teal',
  member: 'blue-grey',
}

const loading = ref(true)
const matrix = ref({ roles: [], permissions: [], grants: {} })

onMounted(async () => {
  try {
    matrix.value = await api.get('/api/permissions')
  } catch (err) {
    messages.error(err.message || t('permissions.loadError'))
  } finally {
    loading.value = false
  }
})

// A permission is granted to a role when it appears in that role's grant list.
function granted(role, perm) {
  return (matrix.value.grants[role] || []).includes(perm)
}
function permLabel(perm) {
  const key = PERM_KEY[perm]
  return key ? t('permissions.perm.' + key) : perm
}

const platformCards = computed(() => [
  { key: 'superadmin', name: t('permissions.platform.superadminName'), desc: t('permissions.platform.superadminDesc'), color: 'deep-purple', icon: '$superadmin' },
  { key: 'support', name: t('permissions.platform.supportName'), desc: t('permissions.platform.supportDesc'), color: 'primary', icon: '$admin' },
  { key: 'none', name: t('permissions.platform.noneName'), desc: t('permissions.platform.noneDesc'), color: 'blue-grey', icon: '$account' },
])

const notes = computed(() => [
  t('permissions.notes.ownerOnly'),
  t('permissions.notes.customerCreate'),
  t('permissions.notes.leaderScope'),
])
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <div class="d-flex flex-wrap align-center mb-1" style="gap: 10px">
      <v-icon icon="$permissions" size="large" color="deep-purple" />
      <h1 class="text-h5 font-weight-bold">{{ $t('permissions.title') }}</h1>
      <v-chip size="x-small" color="deep-purple" variant="tonal" class="ml-1">
        <v-icon icon="$permissions" start size="12" />{{ $t('permissions.restrictedNote') }}
      </v-chip>
    </div>
    <div class="text-medium-emphasis mb-5" style="max-width: 70ch">{{ $t('permissions.subtitle') }}</div>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <!-- Company roles matrix -->
    <div class="mb-2">
      <h2 class="text-subtitle-1 font-weight-bold">{{ $t('permissions.companyRolesTitle') }}</h2>
      <div class="text-body-2 text-medium-emphasis" style="max-width: 68ch">
        {{ $t('permissions.companyRolesSubtitle') }}
      </div>
    </div>

    <v-card rounded="lg" variant="outlined" class="mb-6">
      <div class="matrix-scroll">
        <v-table class="matrix">
          <thead>
            <tr>
              <th class="cap-col">{{ $t('permissions.capability') }}</th>
              <th v-for="role in matrix.roles" :key="role" class="text-center role-col">
                <v-chip size="small" :color="roleColor[role]" variant="tonal">{{ $t('roles.' + role) }}</v-chip>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="perm in matrix.permissions" :key="perm">
              <td class="cap-col font-weight-medium">{{ permLabel(perm) }}</td>
              <td v-for="role in matrix.roles" :key="role + perm" class="text-center">
                <v-icon
                  v-if="granted(role, perm)"
                  icon="$completed"
                  color="success"
                  size="small"
                  :aria-label="permLabel(perm)"
                />
                <span v-else class="text-disabled" aria-hidden="true">—</span>
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>
    </v-card>

    <!-- Notes -->
    <v-alert type="info" variant="tonal" class="mb-6" density="comfortable">
      <div class="font-weight-medium mb-1">{{ $t('permissions.notesTitle') }}</div>
      <ul class="notes-list">
        <li v-for="(note, i) in notes" :key="i">{{ note }}</li>
      </ul>
    </v-alert>

    <!-- Platform roles -->
    <div class="mb-2">
      <h2 class="text-subtitle-1 font-weight-bold">{{ $t('permissions.platformTitle') }}</h2>
      <div class="text-body-2 text-medium-emphasis" style="max-width: 68ch">
        {{ $t('permissions.platformSubtitle') }}
      </div>
    </div>
    <v-row>
      <v-col v-for="p in platformCards" :key="p.key" cols="12" md="4">
        <v-card rounded="lg" variant="outlined" class="h-100">
          <v-card-item>
            <template #prepend>
              <v-avatar :color="p.color" variant="tonal" size="40"><v-icon :icon="p.icon" /></v-avatar>
            </template>
            <v-card-title class="text-subtitle-1 font-weight-bold">{{ p.name }}</v-card-title>
          </v-card-item>
          <v-card-text class="pt-0 text-body-2 text-medium-emphasis">{{ p.desc }}</v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.matrix-scroll {
  overflow-x: auto;
}
.matrix {
  min-width: 640px;
}
/* Keep the capability column readable and left-aligned; role columns are even. */
.cap-col {
  text-align: left;
  min-width: 190px;
}
.role-col {
  min-width: 96px;
}
.matrix :deep(thead th) {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.22);
}
.notes-list {
  margin: 0;
  padding-left: 18px;
}
.notes-list li {
  margin: 2px 0;
}
</style>
