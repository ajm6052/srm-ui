<script setup>
import { ref } from 'vue'
import { useAuthStore } from '@stores/auth'

const auth = useAuthStore()

const email = ref('')
const loading = ref(false)
const sent = ref(false)

async function submit() {
  loading.value = true
  try {
    await auth.requestPasswordReset(email.value)
    // The API deliberately returns the same result whether or not the email
    // exists, so we always show the same confirmation.
    sent.value = true
  } catch {
    // Even on an unexpected error we avoid leaking anything; show the same note.
    sent.value = true
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
          <h1 class="text-h5 font-weight-bold mt-2">{{ $t('auth.resetTitle') }}</h1>
          <p class="text-medium-emphasis">{{ $t('auth.resetSubtitle') }}</p>
        </div>

        <v-card elevation="4" rounded="lg">
          <v-card-text class="pa-6">
            <v-alert v-if="sent" type="success" variant="tonal" class="mb-2">
              {{ $t('auth.resetSent') }}
            </v-alert>

            <v-form v-else @submit.prevent="submit">
              <v-text-field
                v-model="email"
                :label="$t('auth.email')"
                type="email"
                prepend-inner-icon="$account"
                variant="outlined"
                autofocus
                :disabled="loading"
              />
              <v-btn type="submit" color="primary" size="large" block :loading="loading">
                {{ $t('auth.sendResetLink') }}
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
