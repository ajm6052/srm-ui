<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'
import { useMessagesStore } from '@stores/messages'
import { zoneLabel } from '@utils/calendar'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])

const auth = useAuthStore()
const messages = useMessagesStore()

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const name = ref('')
const timezone = ref('UTC')
const saving = ref(false)
const error = ref('')

// The full IANA zone list where the browser exposes it; a small common set
// otherwise, so the picker always has sensible options.
const FALLBACK_ZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
]
const zones = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return FALLBACK_ZONES
  }
})()

// Re-seed the form from the active company each time the dialog opens.
watch(
  () => props.modelValue,
  (isOpen) => {
    if (!isOpen) return
    error.value = ''
    name.value = auth.company?.name || ''
    timezone.value = auth.company?.timezone || 'UTC'
  },
)

const zoneHint = computed(() =>
  t('companySettings.currentTime', { time: nowIn(timezone.value), zone: zoneLabel(timezone.value) }),
)
function nowIn(tz) {
  try {
    return new Date().toLocaleTimeString(undefined, { timeZone: tz, hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

async function save() {
  error.value = ''
  if (!name.value.trim()) {
    error.value = t('companySettings.nameRequired')
    return
  }
  saving.value = true
  try {
    await auth.updateCompanySettings({ name: name.value.trim(), timezone: timezone.value })
    messages.success(t('companySettings.saved'))
    open.value = false
  } catch (err) {
    error.value = err.message || t('companySettings.couldNotSave')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="480">
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center pa-4">
        <v-icon icon="$company" class="mr-2" />
        {{ $t('companySettings.title') }}
        <v-spacer />
        <v-btn icon="$close" variant="text" density="comfortable" @click="open = false" />
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4">
        <v-text-field
          v-model="name"
          :label="$t('companySettings.companyName')"
          prepend-inner-icon="$company"
          variant="outlined"
          :disabled="saving"
        />
        <v-autocomplete
          v-model="timezone"
          :items="zones"
          :label="$t('companySettings.timeZone')"
          prepend-inner-icon="$schedule"
          variant="outlined"
          :disabled="saving"
          :hint="zoneHint"
          persistent-hint
          auto-select-first
        />
        <p class="text-caption text-medium-emphasis mt-3 mb-0">
          {{ $t('companySettings.zoneNote') }}
        </p>

        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">
          {{ error }}
        </v-alert>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="open = false">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :loading="saving" @click="save">{{ $t('common.save') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
