<script setup>
import { useAuthStore } from '@stores/auth'
const auth = useAuthStore()
</script>

<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" md="6" class="text-center">
        <v-icon icon="$alert" size="64" color="warning" />
        <h1 class="text-h4 font-weight-bold mt-4">{{ $t('notFound.title') }}</h1>
        <p class="text-medium-emphasis mb-6">
          {{ $t('notFound.message') }}
        </p>
        <v-btn :to="{ name: auth.loggedIn ? 'schedule' : 'login' }" color="primary">
          {{ $t('notFound.goBack') }}
        </v-btn>
      </v-col>
    </v-row>
  </v-container>
</template>
