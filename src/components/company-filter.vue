<script setup>
// A single-select company filter for the platform operator's cross-company views.
// It offers "All companies" plus every company present in the data, and v-models
// the chosen company id (null = all). List views filter their rows by it client-
// side; the reports view refetches scoped to it.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  modelValue: { type: [Number, null], default: null },
  // [{ id, name }] — the companies to offer (typically derived from the rows).
  companies: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const items = computed(() => [
  { title: t('common.allCompanies'), value: null },
  ...props.companies.map((c) => ({ title: c.name, value: c.id })),
])

const model = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
</script>

<template>
  <v-select
    v-model="model"
    :items="items"
    :label="$t('common.company')"
    density="compact"
    variant="outlined"
    hide-details
    prepend-inner-icon="$company"
    class="company-filter"
  />
</template>

<style scoped>
.company-filter {
  max-width: 260px;
}
</style>
