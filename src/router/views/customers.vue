<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCustomersStore } from '@stores/customers'
import { useAuthStore } from '@stores/auth'
import { useMessagesStore } from '@stores/messages'
import { useCrossCompany } from '@src/composables/useCrossCompany'
import CompanyFilter from '@components/company-filter.vue'

const customers = useCustomersStore()
const auth = useAuthStore()
const messages = useMessagesStore()
const { t } = useI18n({ useScope: 'global' })

// Cross-company (platform operator) mode: read-only list spanning companies.
const { cross, companyId, companies, mergeCompanies } = useCrossCompany()

const canManage = computed(() => auth.can('customers:manage') && !cross.value)

async function load() {
  await customers.fetch({ companyId: companyId.value })
  if (cross.value) mergeCompanies(customers.items.map((c) => c.company).filter(Boolean))
}
onMounted(load)
watch(companyId, load)

// --- customer create / edit ---
const dialog = ref(false)
const editing = ref(null)
const form = ref(blankCustomer())
const saving = ref(false)

function blankCustomer() {
  return { name: '', email: '', phone: '', notes: '' }
}
function openCreate() {
  editing.value = null
  form.value = blankCustomer()
  dialog.value = true
}
function openEdit(c) {
  editing.value = c
  form.value = { name: c.name, email: c.email || '', phone: c.phone || '', notes: c.notes || '' }
  dialog.value = true
}
async function saveCustomer() {
  if (!form.value.name.trim()) {
    messages.error(t('customers.nameRequired'))
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      await customers.update(editing.value.id, form.value)
      messages.success(t('customers.saved'))
    } else {
      await customers.create(form.value)
      messages.success(t('customers.added'))
    }
    dialog.value = false
    await customers.fetch()
  } catch (err) {
    messages.error(err.message || t('customers.couldNotSave'))
  } finally {
    saving.value = false
  }
}
async function removeCustomer(c) {
  if (!confirm(t('customers.confirmDelete', { name: c.name }))) return
  try {
    await customers.remove(c.id)
    messages.success(t('customers.deleted'))
    await customers.fetch()
  } catch (err) {
    messages.error(err.message || t('customers.couldNotDelete'))
  }
}

// --- site create / edit ---
const siteDialog = ref(false)
const siteCustomer = ref(null)
const editingSite = ref(null)
const siteForm = ref(blankSite())
const savingSite = ref(false)

function blankSite() {
  return { label: '', address: '', notes: '' }
}
function openAddSite(c) {
  siteCustomer.value = c
  editingSite.value = null
  siteForm.value = blankSite()
  siteDialog.value = true
}
function openEditSite(c, s) {
  siteCustomer.value = c
  editingSite.value = s
  siteForm.value = { label: s.label, address: s.address || '', notes: s.notes || '' }
  siteDialog.value = true
}
async function saveSite() {
  if (!siteForm.value.label.trim()) {
    messages.error(t('customers.siteLabelRequired'))
    return
  }
  savingSite.value = true
  try {
    if (editingSite.value) {
      await customers.updateSite(siteCustomer.value.id, editingSite.value.id, siteForm.value)
      messages.success(t('customers.siteSaved'))
    } else {
      await customers.addSite(siteCustomer.value.id, siteForm.value)
      messages.success(t('customers.siteAdded'))
    }
    siteDialog.value = false
    await customers.fetch()
  } catch (err) {
    messages.error(err.message || t('customers.couldNotSaveSite'))
  } finally {
    savingSite.value = false
  }
}
async function removeSite(c, s) {
  if (!confirm(t('customers.confirmRemoveSite', { label: s.label }))) return
  try {
    await customers.removeSite(c.id, s.id)
    messages.success(t('customers.siteRemoved'))
    await customers.fetch()
  } catch (err) {
    messages.error(err.message || t('customers.couldNotRemoveSite'))
  }
}
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <div class="d-flex align-center mb-4 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold">{{ $t('customers.title') }}</h1>
        <div class="text-medium-emphasis">{{ $t('customers.subtitle') }}</div>
      </div>
      <v-chip v-if="cross" size="small" color="deep-purple" variant="tonal" prepend-icon="$admin">
        {{ $t('common.crossCompanyReadOnly') }}
      </v-chip>
      <v-spacer />
      <company-filter v-if="cross" v-model="companyId" :companies="companies" />
      <v-btn v-if="canManage" color="primary" prepend-icon="$addNew" @click="openCreate">{{ $t('customers.addCustomer') }}</v-btn>
    </div>

    <v-alert v-if="!customers.loading && !customers.items.length" type="info" variant="tonal">
      {{ $t('customers.empty') }}
      <template v-if="canManage"> {{ $t('customers.emptyHint') }}</template>
    </v-alert>

    <v-expansion-panels v-else variant="accordion" multiple>
      <v-expansion-panel v-for="c in customers.items" :key="c.id" elevation="0" rounded="lg" class="customer-panel">
        <v-expansion-panel-title>
          <div class="d-flex align-center flex-grow-1" style="gap: 12px; min-width: 0">
            <v-avatar color="primary" variant="tonal" size="36"><v-icon icon="$company" /></v-avatar>
            <div style="min-width: 0">
              <div class="font-weight-bold text-truncate">{{ c.name }}</div>
              <div class="text-caption text-medium-emphasis text-truncate">
                <template v-if="c.email">{{ c.email }}</template>
                <template v-if="c.email && c.phone"> · </template>
                <template v-if="c.phone">{{ c.phone }}</template>
                <template v-if="!c.email && !c.phone">{{ $t('customers.noContact') }}</template>
              </div>
            </div>
            <v-spacer />
            <v-chip v-if="cross && c.company" size="small" variant="tonal" color="indigo" class="mr-2">
              <v-icon icon="$company" start size="x-small" />{{ c.company.name }}
            </v-chip>
            <v-chip size="small" variant="tonal" color="secondary" class="mr-2">
              {{ $t('customers.siteCount', (c.sites || []).length) }}
            </v-chip>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div v-if="c.notes" class="text-body-2 text-medium-emphasis mb-3">{{ c.notes }}</div>

          <div class="d-flex align-center mb-2">
            <div class="text-overline text-medium-emphasis">{{ $t('customers.sites') }}</div>
            <v-spacer />
            <v-btn v-if="canManage" size="small" variant="text" prepend-icon="$addNew" @click="openAddSite(c)">
              {{ $t('customers.addSite') }}
            </v-btn>
          </div>
          <v-list v-if="(c.sites || []).length" density="compact" class="py-0">
            <v-list-item v-for="s in c.sites" :key="s.id" class="px-0">
              <template #prepend><v-icon icon="$location" class="mr-2 text-medium-emphasis" /></template>
              <v-list-item-title class="font-weight-medium">{{ s.label }}</v-list-item-title>
              <v-list-item-subtitle v-if="s.address">{{ s.address }}</v-list-item-subtitle>
              <template #append>
                <template v-if="canManage">
                  <v-btn icon="$edit" variant="text" size="small" @click="openEditSite(c, s)" />
                  <v-btn icon="$delete" variant="text" size="small" color="error" @click="removeSite(c, s)" />
                </template>
              </template>
            </v-list-item>
          </v-list>
          <p v-else class="text-caption text-medium-emphasis mb-2">{{ $t('customers.noSites') }}</p>

          <div v-if="canManage" class="d-flex mt-3" style="gap: 8px">
            <v-btn size="small" variant="tonal" prepend-icon="$edit" @click="openEdit(c)">{{ $t('customers.editCustomerBtn') }}</v-btn>
            <v-btn size="small" variant="text" color="error" prepend-icon="$delete" @click="removeCustomer(c)">
              {{ $t('common.delete') }}
            </v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- Customer dialog -->
    <v-dialog v-model="dialog" max-width="480">
      <v-card rounded="lg">
        <v-card-title class="pa-4">{{ editing ? $t('customers.editCustomer') : $t('customers.addCustomer') }}</v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <v-text-field v-model="form.name" :label="$t('customers.name')" prepend-inner-icon="$company" variant="outlined" />
          <v-text-field v-model="form.email" :label="$t('customers.contactEmail')" type="email" variant="outlined" />
          <v-text-field v-model="form.phone" :label="$t('customers.phone')" variant="outlined" />
          <v-textarea v-model="form.notes" :label="$t('customers.notes')" variant="outlined" rows="2" auto-grow />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="dialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="saving" @click="saveCustomer">{{ $t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Site dialog -->
    <v-dialog v-model="siteDialog" max-width="460">
      <v-card rounded="lg">
        <v-card-title class="pa-4">
          {{ editingSite ? $t('customers.editSite') : $t('customers.addSite') }}
          <span class="text-medium-emphasis"> — {{ siteCustomer?.name }}</span>
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <v-text-field v-model="siteForm.label" :label="$t('customers.labelField')" :hint="$t('customers.siteLabelHint')" prepend-inner-icon="$location" variant="outlined" />
          <v-text-field v-model="siteForm.address" :label="$t('customers.address')" variant="outlined" />
          <v-textarea v-model="siteForm.notes" :label="$t('customers.notes')" variant="outlined" rows="2" auto-grow />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" :disabled="savingSite" @click="siteDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="savingSite" @click="saveSite">{{ $t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.customer-panel {
  border: 1px solid rgba(var(--v-border-color), 0.18);
  margin-bottom: 8px;
}
</style>
