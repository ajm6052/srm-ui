<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSupportStore } from '@stores/support'
import { useMessagesStore } from '@stores/messages'

const support = useSupportStore()
const messages = useMessagesStore()
const { t } = useI18n({ useScope: 'global' })

const page = ref(1)
const totalPages = computed(() => support.pagination?.total_pages || 1)
function load() {
  return support.fetch({}, { page: page.value })
}

const TYPES = computed(() => [
  { value: 'bug', title: t('support.types.bug') },
  { value: 'request', title: t('support.types.request') },
  { value: 'question', title: t('support.types.question') },
  { value: 'other', title: t('support.types.other') },
])
const PRIORITIES = computed(() => [
  { value: 'low', title: t('support.priorities.low') },
  { value: 'medium', title: t('support.priorities.medium') },
  { value: 'high', title: t('support.priorities.high') },
  { value: 'urgent', title: t('support.priorities.urgent') },
])
const typeColor = { bug: 'red', request: 'indigo', question: 'teal', other: 'blue-grey' }
const statusColor = { open: 'primary', in_progress: 'info', resolved: 'success', closed: 'grey' }
const priorityColor = { low: 'blue-grey', medium: 'primary', high: 'orange', urgent: 'red' }

onMounted(load)

// --- create ---
const createDialog = ref(false)
const form = ref({ type: 'bug', subject: '', description: '', priority: 'medium' })
function openCreate() {
  form.value = { type: 'bug', subject: '', description: '', priority: 'medium' }
  createDialog.value = true
}
async function create() {
  if (!form.value.subject) {
    messages.error(t('support.subjectRequired'))
    return
  }
  try {
    await support.create(form.value)
    messages.success(t('support.filed'))
    createDialog.value = false
    page.value = 1
    await load()
  } catch (err) {
    messages.error(err.message)
  }
}

// --- detail ---
const detailDialog = ref(false)
const ticket = ref(null)
const comment = ref('')
async function open(row) {
  ticket.value = await support.get(row.id)
  comment.value = ''
  detailDialog.value = true
}
async function addComment() {
  if (!comment.value.trim()) return
  try {
    ticket.value = await support.addComment(ticket.value.id, comment.value.trim())
    comment.value = ''
  } catch (err) {
    messages.error(err.message)
  }
}
function fmt(iso) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <div class="d-flex align-center mb-4">
      <div>
        <h1 class="text-h5 font-weight-bold">{{ $t('support.title') }}</h1>
        <div class="text-medium-emphasis">{{ $t('support.subtitle') }}</div>
      </div>
      <v-spacer />
      <v-btn color="primary" prepend-icon="$addNew" @click="openCreate">{{ $t('support.newTicket') }}</v-btn>
    </div>

    <v-progress-linear v-if="support.loading" indeterminate color="primary" class="mb-4" />

    <v-row v-if="support.items.length">
      <v-col v-for="t in support.items" :key="t.id" cols="12" md="6">
        <v-card rounded="lg" variant="outlined" @click="open(t)" style="cursor: pointer">
          <v-card-item>
            <v-card-title class="text-subtitle-1">{{ t.subject }}</v-card-title>
            <v-card-subtitle>{{ t.reference }}</v-card-subtitle>
          </v-card-item>
          <v-card-text class="pt-0">
            <div class="d-flex flex-wrap" style="gap: 6px">
              <v-chip size="small" :color="typeColor[t.type]" variant="tonal">{{ $t('support.types.' + t.type) }}</v-chip>
              <v-chip size="small" :color="statusColor[t.status]" variant="tonal">{{ $t('support.statuses.' + t.status) }}</v-chip>
              <v-chip size="small" :color="priorityColor[t.priority]" variant="tonal">{{ $t('support.priorities.' + t.priority) }}</v-chip>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-alert v-if="!support.loading && !support.items.length" type="info" variant="tonal">
      {{ $t('support.empty') }}
    </v-alert>

    <v-pagination
      v-if="totalPages > 1"
      v-model="page"
      :length="totalPages"
      :total-visible="7"
      density="comfortable"
      class="mt-4"
      @update:model-value="load"
    />

    <!-- create -->
    <v-dialog v-model="createDialog" max-width="520">
      <v-card rounded="lg">
        <v-card-title class="pa-4">{{ $t('support.newTicketTitle') }}</v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <v-row dense>
            <v-col cols="6">
              <v-select v-model="form.type" :items="TYPES" :label="$t('support.typeLabel')" variant="outlined" />
            </v-col>
            <v-col cols="6">
              <v-select v-model="form.priority" :items="PRIORITIES" :label="$t('support.priority')" variant="outlined" />
            </v-col>
          </v-row>
          <v-text-field v-model="form.subject" :label="$t('support.subject')" variant="outlined" />
          <v-textarea v-model="form.description" :label="$t('support.description')" variant="outlined" rows="4" auto-grow />
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="createDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" @click="create">{{ $t('support.fileTicket') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- detail -->
    <v-dialog v-model="detailDialog" max-width="640" scrollable>
      <v-card v-if="ticket" rounded="lg">
        <v-card-item>
          <v-card-title>{{ ticket.subject }}</v-card-title>
          <v-card-subtitle>{{ ticket.reference }}</v-card-subtitle>
          <template #append>
            <v-btn icon="$close" variant="text" @click="detailDialog = false" />
          </template>
        </v-card-item>
        <v-divider />
        <v-card-text style="max-height: 60vh">
          <div class="d-flex flex-wrap mb-4" style="gap: 6px">
            <v-chip size="small" :color="typeColor[ticket.type]" variant="tonal">{{ $t('support.types.' + ticket.type) }}</v-chip>
            <v-chip size="small" :color="statusColor[ticket.status]" variant="tonal">{{ $t('support.statuses.' + ticket.status) }}</v-chip>
            <v-chip size="small" :color="priorityColor[ticket.priority]" variant="tonal">{{ $t('support.priorities.' + ticket.priority) }}</v-chip>
          </div>

          <div
            v-for="c in ticket.comments"
            :key="c.id"
            class="mb-3 pa-3 rounded-lg"
            :class="c.from_admin ? 'bg-blue-lighten-5' : 'bg-grey-lighten-4'"
          >
            <div class="d-flex align-center mb-1">
              <v-icon :icon="c.from_admin ? '$admin' : '$account'" size="small" class="mr-1" />
              <span class="font-weight-medium text-body-2">{{ c.author_name || (c.from_admin ? $t('support.supportTag') : $t('support.you')) }}</span>
              <v-chip v-if="c.from_admin" size="x-small" color="primary" variant="tonal" class="ml-2">{{ $t('support.supportTag') }}</v-chip>
              <v-spacer />
              <span class="text-caption text-medium-emphasis">{{ fmt(c.created_at) }}</span>
            </div>
            <div class="text-body-2" style="white-space: pre-wrap">{{ c.body }}</div>
          </div>
          <div v-if="!ticket.comments || !ticket.comments.length" class="text-medium-emphasis">{{ $t('support.noMessages') }}</div>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-text-field
            v-model="comment"
            :placeholder="$t('support.addReply')"
            variant="outlined"
            density="comfortable"
            hide-details
            @keyup.enter="addComment"
          />
          <v-btn color="primary" icon="$nextDay" class="ml-2" :disabled="!comment.trim()" @click="addComment" />
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
