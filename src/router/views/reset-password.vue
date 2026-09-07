<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n({ useScope: 'global' })

// The token arrives in the reset link as ?token=…
const token = computed(() => String(route.query.token || ''))

const password = ref('')
const confirm = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const done = ref(false)

const tooShort = computed(() => password.value.length > 0 && password.value.length < 8)
const mismatch = computed(() => confirm.value.length > 0 && confirm.value !== password.value)
const canSubmit = computed(
  () => token.value && password.value.length >= 8 && confirm.value === password.value,
)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await auth.resetPassword(token.value, password.value)
    done.value = true
    setTimeout(() => router.push({ name: 'login' }), 1500)
  } catch (err) {
    error.value =
      err.status === 400 ? t('auth.resetLinkInvalid') : err.message || t('auth.couldNotReset')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="5" lg="4">
        <div class="text-center mb-6">
          <v-icon icon="$key" size="44" color="primary" />
          <h1 class="text-h5 font-weight-bold mt-2">{{ $t('auth.newPasswordTitle') }}</h1>
        </div>

        <v-card elevation="4" rounded="lg">
          <v-card-text class="pa-6">
            <v-alert v-if="done" type="success" variant="tonal">
              {{ $t('auth.resetDone') }}
            </v-alert>

            <v-alert v-else-if="!token" type="error" variant="tonal">
              {{ $t('auth.resetMissingToken') }}<router-link :to="{ name: 'forgot-password' }">{{ $t('auth.requestNewOne') }}</router-link>.
            </v-alert>

            <v-form v-else @submit.prevent="submit">
              <v-text-field
                v-model="password"
                :label="$t('auth.newPassword')"
                :type="showPassword ? 'text' : 'password'"
                prepend-inner-icon="$settings"
                :append-inner-icon="showPassword ? '$hide' : '$show'"
                variant="outlined"
                autofocus
                :disabled="loading"
                :error-messages="tooShort ? $t('auth.atLeast8') : ''"
                @click:append-inner="showPassword = !showPassword"
              />
              <v-text-field
                v-model="confirm"
                :label="$t('auth.confirmNewPassword')"
                :type="showPassword ? 'text' : 'password'"
                prepend-inner-icon="$settings"
                variant="outlined"
                :disabled="loading"
                :error-messages="mismatch ? $t('auth.passwordsMismatch') : ''"
              />

              <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
                {{ error }}
              </v-alert>

              <v-btn
                type="submit"
                color="primary"
                size="large"
                block
                :loading="loading"
                :disabled="!canSubmit"
              >
                {{ $t('auth.setNewPassword') }}
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>

        <p class="text-center text-medium-emphasis mt-4">
          <router-link :to="{ name: 'login' }">{{ $t('auth.backToSignIn') }}</router-link>
        </p>
      </v-col>
    </v-row>
  </v-container>
</template>
