<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@stores/auth'

const auth = useAuthStore()
const router = useRouter()
const { t } = useI18n({ useScope: 'global' })

const companyName = ref('')
const slug = ref('')
const ownerName = ref('')
const ownerEmail = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

// Mirror the backend's slugify so the user sees the login slug they'll get.
const suggestedSlug = computed(() =>
  companyName.value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, ''),
)
const handleHint = computed(() =>
  suggestedSlug.value
    ? t('register.handleHintSuggested', { slug: suggestedSlug.value })
    : t('register.handleHintBlank'),
)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await auth.register({
      company_name: companyName.value,
      slug: slug.value || suggestedSlug.value,
      owner_name: ownerName.value,
      owner_email: ownerEmail.value,
      password: password.value,
    })
    router.push({ name: 'schedule' })
  } catch (err) {
    if (err.status === 409) error.value = t('register.slugTaken')
    else if (err.status === 400) error.value = t('register.checkDetails')
    else error.value = err.message || t('register.failed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="9" md="6" lg="5">
        <div class="text-center mb-6">
          <v-icon icon="$job" size="48" color="primary" />
          <h1 class="text-h5 font-weight-bold mt-2">{{ $t('register.title') }}</h1>
          <p class="text-medium-emphasis">{{ $t('register.subtitle') }}</p>
        </div>

        <v-card elevation="4" rounded="lg">
          <v-card-text class="pa-6">
            <v-form @submit.prevent="submit">
              <v-text-field
                v-model="companyName"
                :label="$t('register.companyName')"
                prepend-inner-icon="$company"
                variant="outlined"
                autofocus
                :disabled="loading"
              />
              <v-text-field
                v-model="slug"
                :label="$t('register.handle')"
                :placeholder="suggestedSlug || $t('register.handlePlaceholder')"
                :hint="handleHint"
                persistent-hint
                variant="outlined"
                class="mb-2"
                :disabled="loading"
              />
              <v-divider class="my-3" />
              <v-text-field
                v-model="ownerName"
                :label="$t('register.yourName')"
                prepend-inner-icon="$account"
                variant="outlined"
                :disabled="loading"
              />
              <v-text-field
                v-model="ownerEmail"
                :label="$t('register.yourEmail')"
                type="email"
                prepend-inner-icon="$account"
                variant="outlined"
                :disabled="loading"
              />
              <v-text-field
                v-model="password"
                :label="$t('register.password')"
                type="password"
                prepend-inner-icon="$settings"
                :hint="$t('register.passwordHint')"
                variant="outlined"
                :disabled="loading"
              />

              <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
                {{ error }}
              </v-alert>

              <v-btn type="submit" color="primary" size="large" block :loading="loading">
                {{ $t('register.createButton') }}
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>

        <p class="text-center text-medium-emphasis mt-4">
          {{ $t('register.haveAccount') }}
          <router-link :to="{ name: 'login' }">{{ $t('register.signIn') }}</router-link>
        </p>
      </v-col>
    </v-row>
  </v-container>
</template>
