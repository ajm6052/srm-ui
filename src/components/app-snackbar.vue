<script setup>
import { useMessagesStore } from '@stores/messages'

// Renders the global notification queue (see stores/messages). Bound with a
// computed proxy so closing the snackbar clears the store's open flag.
const messages = useMessagesStore()
</script>

<template>
  <v-snackbar
    v-model="messages.open"
    :color="messages.color"
    :timeout="messages.timeout"
    location="bottom right"
  >
    {{ messages.text }}
    <template #actions>
      <v-btn variant="text" icon="$close" @click="messages.open = false" />
    </template>
  </v-snackbar>
</template>
