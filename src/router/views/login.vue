<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'
import LanguageToggle from '@components/language-toggle.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n({ useScope: 'global' })

const email = ref('')
const password = ref('')
const newPassword = ref('')
const challenge = ref(false) // Cognito NEW_PASSWORD_REQUIRED force-change
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

function go() {
  if (auth.company) {
    router.push(route.query.redirectFrom || { name: 'schedule' })
  } else if (auth.hasMultipleWorkspaces) {
    router.push({ name: 'select-workspace', query: route.query })
  } else {
    // Platform staff with no company membership land in the admin panel.
    router.push({ name: 'admin' })
  }
}

async function submit() {
  error.value = ''
  loading.value = true
  try {
    if (challenge.value) {
      await auth.confirmNewPassword(newPassword.value)
      go()
      return
    }
    const step = await auth.logIn({ email: email.value, password: password.value })
    if (step === 'NEW_PASSWORD_REQUIRED') {
      challenge.value = true
      return
    }
    go()
  } catch (err) {
    error.value = err.status === 401 ? t('auth.signInFailed') : err.message || t('auth.signInFailed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-container class="fill-height" fluid>
    <div class="lang-corner">
      <language-toggle />
    </div>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="5" lg="4">
        <div class="text-center mb-6">
          <div class="brand-mark mx-auto">S</div>
          <h1 class="text-h5 font-weight-bold mt-3">
            {{ challenge ? $t('auth.setNewPassword') : $t('auth.welcomeBack') }}
          </h1>
          <p class="text-medium-emphasis">
            {{ challenge ? $t('auth.setNewPasswordSubtitle') : $t('auth.signInSubtitle') }}
          </p>
        </div>

        <v-card elevation="2" rounded="xl" border>
          <v-card-text class="pa-6">
            <v-form @submit.prevent="submit">
              <template v-if="!challenge">
                <v-text-field
                  v-model="email"
                  :label="$t('auth.email')"
                  type="email"
                  prepend-inner-icon="$account"
                  variant="outlined"
                  autofocus
                  :disabled="loading"
                />
                <v-text-field
                  v-model="password"
                  :label="$t('auth.password')"
                  :type="showPassword ? 'text' : 'password'"
                  prepend-inner-icon="$settings"
                  :append-inner-icon="showPassword ? '$hide' : '$show'"
                  variant="outlined"
                  :disabled="loading"
                  @click:append-inner="showPassword = !showPassword"
                />
              </template>

              <v-text-field
                v-else
                v-model="newPassword"
                :label="$t('auth.newPassword')"
                :type="showPassword ? 'text' : 'password'"
                prepend-inner-icon="$settings"
                :append-inner-icon="showPassword ? '$hide' : '$show'"
                variant="outlined"
                autofocus
                :disabled="loading"
                @click:append-inner="showPassword = !showPassword"
              />

              <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
                {{ error }}
              </v-alert>

              <v-btn type="submit" color="primary" size="large" block :loading="loading">
                {{ challenge ? $t('common.continue') : $t('auth.signIn') }}
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.lang-corner {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 1;
}
.brand-mark {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: rgb(var(--v-theme-primary));
  color: #fff;
  font-weight: 700;
  font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: -0.02em;
  box-shadow: 0 6px 16px rgba(79, 70, 229, 0.3);
}
</style>
