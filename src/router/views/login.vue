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
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const result = await auth.logIn({ email: email.value, password: password.value })
    // Platform staff with no company land in the admin panel.
    if (!result.user?.company) {
      router.push({ name: 'admin' })
      return
    }
    // Belongs to more than one company? Let them choose which workspace to open.
    if (result.memberships && result.memberships.length > 1) {
      router.push({ name: 'select-workspace', query: route.query })
      return
    }
    const dest = route.query.redirectFrom || { name: 'schedule' }
    router.push(dest)
  } catch (err) {
    // A wrong email or password both return the same 401 by design.
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
          <h1 class="text-h5 font-weight-bold mt-3">{{ $t('auth.welcomeBack') }}</h1>
          <p class="text-medium-emphasis">{{ $t('auth.signInSubtitle') }}</p>
        </div>

        <v-card elevation="2" rounded="xl" border>
          <v-card-text class="pa-6">
            <v-form @submit.prevent="submit">
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

              <div class="text-right mb-3" style="margin-top: -8px">
                <router-link
                  :to="{ name: 'forgot-password' }"
                  class="text-caption text-decoration-none"
                >
                  {{ $t('auth.forgotPassword') }}
                </router-link>
              </div>

              <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
                {{ error }}
              </v-alert>

              <v-btn
                type="submit"
                color="primary"
                size="large"
                block
                :loading="loading"
              >
                {{ $t('auth.signIn') }}
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>

        <p class="text-center text-medium-emphasis mt-4">
          {{ $t('auth.newHere') }}
          <router-link :to="{ name: 'register' }">{{ $t('auth.createCompany') }}</router-link>
        </p>
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
