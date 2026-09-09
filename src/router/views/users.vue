<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUsersStore } from '@stores/users'
import { useAuthStore } from '@stores/auth'
import { useMessagesStore } from '@stores/messages'
import AvailabilityDialog from '@components/availability-dialog.vue'

const users = useUsersStore()
const auth = useAuthStore()
const messages = useMessagesStore()
const { t } = useI18n({ useScope: 'global' })

const canManage = computed(() => auth.can('users:manage'))

const ROLES = computed(() => [
  { value: 'owner', title: t('roles.owner') },
  { value: 'admin', title: t('roles.admin') },
  { value: 'scheduler', title: t('roles.scheduler') },
  { value: 'team_leader', title: t('roles.team_leader') },
  { value: 'member', title: t('roles.member') },
])
const roleColor = {
  owner: 'deep-purple',
  admin: 'indigo',
  scheduler: 'primary',
  team_leader: 'teal',
  member: 'blue-grey',
}

// Server-side pagination: the table asks for a page/size, we fetch just that page.
const page = ref(1)
const itemsPerPage = ref(25)
function load() {
  return users.fetch({ page: page.value, pageSize: itemsPerPage.value })
}
function onOptions(opts) {
  page.value = opts.page
  itemsPerPage.value = opts.itemsPerPage
  load()
}

const dialog = ref(false)
const editing = ref(null)
const form = ref(blank())
const saving = ref(false)

function blank() {
  return { name: '', email: '', role: 'member', is_active: true }
}
function openCreate() {
  editing.value = null
  form.value = blank()
  dialog.value = true
}
function openEdit(u) {
  editing.value = u
  form.value = { name: u.name, email: u.email, role: u.role, is_active: u.is_active }
  dialog.value = true
}

// Availability editor (working hours + time off).
const availabilityDialog = ref(false)
const availabilityUser = ref(null)
function openAvailability(u) {
  availabilityUser.value = u
  availabilityDialog.value = true
}

async function save() {
  saving.value = true
  try {
    if (editing.value) {
      await users.update(editing.value.id, {
        name: form.value.name,
        role: form.value.role,
        is_active: form.value.is_active,
      })
      messages.success(t('users.saved'))
    } else {
      await users.create({
        name: form.value.name,
        email: form.value.email,
        role: form.value.role,
      })
      messages.success(t('users.added'))
    }
    dialog.value = false
    await load()
  } catch (err) {
    if (err.status === 409) messages.error(t('users.emailInUse'))
    else if (err.status === 400) messages.error(t('users.checkDetails'))
    else messages.error(err.message)
  } finally {
    saving.value = false
  }
}

const headers = computed(() => [
  { title: t('common.name'), key: 'name' },
  { title: t('common.email'), key: 'email' },
  { title: t('common.role'), key: 'role' },
  { title: t('common.status'), key: 'is_active' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
])
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <div class="d-flex align-center mb-4">
      <div>
        <h1 class="text-h5 font-weight-bold">{{ $t('users.title') }}</h1>
        <div class="text-medium-emphasis">{{ $t('users.subtitle') }}</div>
      </div>
      <v-spacer />
      <v-btn v-if="canManage" color="primary" prepend-icon="$addNew" @click="openCreate">{{ $t('users.addUser') }}</v-btn>
    </div>

    <v-card rounded="lg" variant="outlined">
      <v-data-table-server
        :headers="headers"
        :items="users.items"
        :items-length="users.pagination?.total || 0"
        :loading="users.loading"
        :page="page"
        :items-per-page="itemsPerPage"
        density="comfortable"
        @update:options="onOptions"
      >
        <template #[`item.name`]="{ item }">
          <div class="d-flex align-center">
            <v-avatar color="grey-lighten-1" size="32" class="mr-2"><v-icon icon="$account" size="small" /></v-avatar>
            <span class="font-weight-medium">{{ item.name }}</span>
            <v-chip v-if="item.is_platform_admin" size="x-small" color="deep-purple" class="ml-2" variant="tonal">
              {{ $t('users.platformAdmin') }}
            </v-chip>
          </div>
        </template>
        <template #[`item.role`]="{ item }">
          <v-chip size="small" :color="roleColor[item.role]" variant="tonal">
            {{ $t('roles.' + item.role) }}
          </v-chip>
        </template>
        <template #[`item.is_active`]="{ item }">
          <v-chip size="small" :color="item.is_active ? 'success' : 'grey'" variant="tonal">
            {{ item.is_active ? $t('common.active') : $t('common.inactive') }}
          </v-chip>
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn
            v-if="canManage"
            icon="$schedule"
            variant="text"
            size="small"
            :title="$t('users.availability')"
            @click="openAvailability(item)"
          />
          <v-btn v-if="canManage" icon="$edit" variant="text" size="small" :title="$t('common.edit')" @click="openEdit(item)" />
        </template>
      </v-data-table-server>
    </v-card>

    <v-dialog v-model="dialog" max-width="480">
      <v-card rounded="lg">
        <v-card-title class="pa-4">{{ editing ? $t('users.editUser') : $t('users.addUser') }}</v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <v-text-field v-model="form.name" :label="$t('users.name')" prepend-inner-icon="$account" variant="outlined" />
          <v-text-field
            v-model="form.email"
            :label="$t('users.email')"
            type="email"
            prepend-inner-icon="$account"
            variant="outlined"
            :disabled="!!editing"
            :hint="editing ? $t('users.emailImmutable') : ''"
            :persistent-hint="!!editing"
          />
          <v-select
            v-model="form.role"
            :items="ROLES"
            :label="$t('users.role')"
            prepend-inner-icon="$admin"
            variant="outlined"
          />
          <v-switch
            v-if="editing"
            v-model="form.is_active"
            :label="form.is_active ? $t('common.active') : $t('common.inactive')"
            color="success"
            hide-details
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="dialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="saving" @click="save">{{ $t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <availability-dialog v-model="availabilityDialog" :user="availabilityUser" />
  </v-container>
</template>
