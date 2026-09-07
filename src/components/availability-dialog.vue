<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUsersStore } from '@stores/users'
import { useAuthStore } from '@stores/auth'
import { useMessagesStore } from '@stores/messages'
import { toUTCISO, addDaysStr, dayInZone, zoneLabel } from '@utils/calendar'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  user: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const users = useUsersStore()
const auth = useAuthStore()
const messages = useMessagesStore()

const canManage = computed(() => auth.can('users:manage'))
const tz = computed(() => auth.company?.timezone || 'UTC')

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

// Weekdays in display order (Mon..Sun), each carrying its 0=Sun..6=Sat code so it
// maps straight onto the API and the server-side weekday check.
const WEEKDAYS = [
  { code: 1, key: 'monday' },
  { code: 2, key: 'tuesday' },
  { code: 3, key: 'wednesday' },
  { code: 4, key: 'thursday' },
  { code: 5, key: 'friday' },
  { code: 6, key: 'saturday' },
  { code: 0, key: 'sunday' },
]

const loading = ref(false)
const savingHours = ref(false)
// One editable row per weekday (a single window per day in this editor).
const hours = ref([])
const timeOff = ref([])

// New time-off form.
const offForm = ref({ start: '', end: '', reason: '' })
const addingOff = ref(false)

function blankHours() {
  return WEEKDAYS.map((d) => ({ code: d.code, key: d.key, enabled: false, start: '09:00', end: '17:00' }))
}
function minToHHMM(m) {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
function hhmmToMin(s) {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

async function loadAll() {
  if (!props.user) return
  loading.value = true
  try {
    const data = await users.getAvailability(props.user.id)
    const rows = blankHours()
    for (const w of data.working_hours || []) {
      const row = rows.find((r) => r.code === w.weekday)
      if (row && !row.enabled) {
        row.enabled = true
        row.start = minToHHMM(w.start_minute)
        row.end = minToHHMM(w.end_minute)
      }
    }
    hours.value = rows
    timeOff.value = data.time_off || []
  } catch (err) {
    messages.error(err.message || t('availability.couldNotLoad'))
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (!isOpen) return
    offForm.value = { start: '', end: '', reason: '' }
    loadAll()
  },
)

async function saveHours() {
  const windows = []
  for (const r of hours.value) {
    if (!r.enabled) continue
    if (hhmmToMin(r.start) >= hhmmToMin(r.end)) {
      messages.error(t('availability.startBeforeEnd'))
      return
    }
    windows.push({ weekday: r.code, start_minute: hhmmToMin(r.start), end_minute: hhmmToMin(r.end) })
  }
  savingHours.value = true
  try {
    await users.setWorkingHours(props.user.id, windows)
    messages.success(t('availability.hoursSaved'))
  } catch (err) {
    messages.error(err.message || t('availability.couldNotSaveHours'))
  } finally {
    savingHours.value = false
  }
}

// Existing time off, formatted as an inclusive day range in the company zone.
const timeOffRows = computed(() =>
  timeOff.value.map((o) => {
    const firstDay = dayInZone(o.start, tz.value)
    // End is exclusive; the last full day off is the day before it.
    const lastDay = addDaysStr(dayInZone(o.end, tz.value), -1)
    return { id: o.id, reason: o.reason, range: rangeLabel(firstDay, lastDay) }
  }),
)
function rangeLabel(firstDay, lastDay) {
  const fmt = (d) =>
    new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return firstDay === lastDay ? fmt(firstDay) : `${fmt(firstDay)} – ${fmt(lastDay)}`
}

async function addTimeOff() {
  if (!offForm.value.start || !offForm.value.end) {
    messages.error(t('availability.pickDates'))
    return
  }
  if (offForm.value.end < offForm.value.start) {
    messages.error(t('availability.endBeforeStart'))
    return
  }
  addingOff.value = true
  try {
    // All-day, in the company zone: [start 00:00, day-after-end 00:00).
    await users.addTimeOff(props.user.id, {
      start: toUTCISO(offForm.value.start, '00:00', tz.value),
      end: toUTCISO(addDaysStr(offForm.value.end, 1), '00:00', tz.value),
      reason: offForm.value.reason,
    })
    offForm.value = { start: '', end: '', reason: '' }
    messages.success(t('availability.added'))
    await loadAll()
  } catch (err) {
    messages.error(err.message || t('availability.couldNotAdd'))
  } finally {
    addingOff.value = false
  }
}

async function removeTimeOff(id) {
  try {
    await users.removeTimeOff(props.user.id, id)
    await loadAll()
  } catch (err) {
    messages.error(err.message || t('availability.couldNotRemove'))
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="620" scrollable>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center pa-4">
        <v-icon icon="$schedule" class="mr-2" />
        {{ $t('availability.title', { name: user?.name }) }}
        <v-spacer />
        <v-btn icon="$close" variant="text" density="comfortable" @click="open = false" />
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4">
        <div v-if="loading" class="text-center py-8">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <template v-else>
          <p class="text-caption text-medium-emphasis mb-3">
            <v-icon icon="$schedule" size="x-small" /> {{ $t('availability.timesNote', { zone: zoneLabel(tz) }) }}
          </p>

          <!-- Working hours -->
          <div class="text-overline text-medium-emphasis">{{ $t('availability.workingHours') }}</div>
          <div v-for="row in hours" :key="row.code" class="hours-row">
            <v-checkbox
              v-model="row.enabled"
              :label="$t('availability.days.' + row.key)"
              density="compact"
              hide-details
              :disabled="!canManage"
              class="hours-day"
            />
            <div v-if="row.enabled" class="d-flex align-center" style="gap: 8px">
              <v-text-field
                v-model="row.start"
                type="time"
                density="compact"
                variant="outlined"
                hide-details
                :disabled="!canManage"
                style="width: 120px"
              />
              <span class="text-medium-emphasis">{{ $t('availability.to') }}</span>
              <v-text-field
                v-model="row.end"
                type="time"
                density="compact"
                variant="outlined"
                hide-details
                :disabled="!canManage"
                style="width: 120px"
              />
            </div>
            <span v-else class="text-caption text-medium-emphasis">{{ $t('availability.notWorking') }}</span>
          </div>
          <div v-if="canManage" class="d-flex justify-end mt-2">
            <v-btn size="small" color="primary" variant="tonal" :loading="savingHours" @click="saveHours">
              {{ $t('availability.saveHours') }}
            </v-btn>
          </div>

          <v-divider class="my-4" />

          <!-- Time off -->
          <div class="text-overline text-medium-emphasis">{{ $t('availability.timeOff') }}</div>
          <v-list v-if="timeOffRows.length" density="compact" class="py-0">
            <v-list-item v-for="o in timeOffRows" :key="o.id" class="px-0">
              <template #prepend>
                <v-icon icon="$schedule" class="mr-2 text-medium-emphasis" />
              </template>
              <v-list-item-title>{{ o.range }}</v-list-item-title>
              <v-list-item-subtitle v-if="o.reason">{{ o.reason }}</v-list-item-subtitle>
              <template #append>
                <v-btn
                  v-if="canManage"
                  icon="$delete"
                  variant="text"
                  size="small"
                  color="error"
                  @click="removeTimeOff(o.id)"
                />
              </template>
            </v-list-item>
          </v-list>
          <p v-else class="text-caption text-medium-emphasis my-2">{{ $t('availability.noTimeOff') }}</p>

          <div v-if="canManage" class="time-off-form mt-2">
            <v-text-field
              v-model="offForm.start"
              :label="$t('availability.from')"
              type="date"
              density="compact"
              variant="outlined"
              hide-details
            />
            <v-text-field
              v-model="offForm.end"
              :label="$t('availability.until')"
              type="date"
              density="compact"
              variant="outlined"
              hide-details
            />
            <v-text-field
              v-model="offForm.reason"
              :label="$t('availability.reason')"
              density="compact"
              variant="outlined"
              hide-details
            />
            <v-btn color="primary" variant="tonal" :loading="addingOff" @click="addTimeOff">{{ $t('common.add') }}</v-btn>
          </div>
        </template>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ $t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.hours-row {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 44px;
}
.hours-day {
  min-width: 140px;
  flex: 0 0 auto;
}
.time-off-form {
  display: grid;
  grid-template-columns: 1fr 1fr 1.4fr auto;
  gap: 8px;
  align-items: center;
}
@media (max-width: 560px) {
  .time-off-form {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
