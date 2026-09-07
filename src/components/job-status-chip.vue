<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  status: { type: String, required: true },
  size: { type: String, default: 'small' },
})
const { t } = useI18n({ useScope: 'global' })

// One place mapping a job status to its colour and icon, so every screen renders
// a status the same way; the label is translated from the shared jobStatus keys.
const meta = {
  scheduled: { color: 'primary', icon: '$scheduled' },
  in_progress: { color: 'warning', icon: '$inProgress' },
  completed: { color: 'success', icon: '$completed' },
  cancelled: { color: 'grey', icon: '$cancelled' },
}
const m = computed(() => meta[props.status] || { color: 'grey', icon: '$job' })
const label = computed(() =>
  meta[props.status] ? t('jobStatus.' + props.status) : props.status,
)
</script>

<template>
  <v-chip :color="m.color" :size="size" variant="tonal" label>
    <v-icon :icon="m.icon" start :size="size" />{{ label }}
  </v-chip>
</template>
