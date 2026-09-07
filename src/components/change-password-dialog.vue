<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'
import { useMessagesStore } from '@stores/messages'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])

const auth = useAuthStore()
const messages = useMessagesStore()

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const current = ref('')
const next = ref('')
const confirm = ref('')
const show = ref(false)
const loading = ref(false)
const error = ref('')

const tooShort = computed(() => next.value.length > 0 && next.value.length < 8)
const mismatch = computed(() => confirm.value.length > 0 && confirm.value !== next.value)
const canSubmit = computed(
  () => current.value && next.value.length >= 8 && confirm.value === next.value,
)

// Reset the form each time the dialog opens.
watch(open, (v) => {
  if (v) {
    current.value = ''
    next.value = ''
    confirm.value = ''
    error.value = ''
  }
})

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await auth.changePassword(current.value, next.value)
    messages.success(t('password.changed'))
    open.value = false
  } catch (err) {
    error.value =
      err.status === 401 ? t('password.wrongCurrent') : err.message || t('password.couldNotChange')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="440">
    <v-card rounded="lg">
      <v-card-title class="text-h6 pa-4">{{ $t('password.title') }}</v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <v-form @submit.prevent="submit">
          <v-text-field
            v-model="current"
            :label="$t('password.current')"
            :type="show ? 'text' : 'password'"
            :append-inner-icon="show ? '$hide' : '$show'"
            variant="outlined"
            :disabled="loading"
            autofocus
            @click:append-inner="show = !show"
          />
          <v-text-field
            v-model="next"
            :label="$t('password.new')"
            :type="show ? 'text' : 'password'"
            variant="outlined"
            :disabled="loading"
            :error-messages="tooShort ? $t('password.tooShort') : ''"
          />
          <v-text-field
            v-model="confirm"
            :label="$t('password.confirm')"
            :type="show ? 'text' : 'password'"
            variant="outlined"
            :disabled="loading"
            :error-messages="mismatch ? $t('password.mismatch') : ''"
          />
          <v-alert v-if="error" type="error" variant="tonal" density="compact">
            {{ error }}
          </v-alert>
        </v-form>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" :disabled="loading" @click="open = false">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" :loading="loading" :disabled="!canSubmit" @click="submit">
          {{ $t('password.changeButton') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
