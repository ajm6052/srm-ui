<script setup>
import { useI18n } from 'vue-i18n'
import { SUPPORTED, setLocale } from '@i18n'

const { locale } = useI18n({ useScope: 'global' })
</script>

<template>
  <v-btn-toggle
    :model-value="locale"
    density="compact"
    variant="outlined"
    divided
    mandatory
    class="lang-toggle"
    :aria-label="$t('lang.language')"
    @update:model-value="setLocale"
  >
    <v-btn v-for="l in SUPPORTED" :key="l.code" :value="l.code" size="small">{{ l.short }}</v-btn>
  </v-btn-toggle>
</template>

<style scoped>
.lang-toggle {
  height: 34px;
}
.lang-toggle :deep(.v-btn) {
  min-width: 42px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
</style>
