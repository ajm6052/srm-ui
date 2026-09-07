<script setup>
import { ref, watch, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useJobsStore } from '@stores/jobs'
import { useCustomersStore } from '@stores/customers'
import { useAuthStore } from '@stores/auth'
import { useMessagesStore } from '@stores/messages'
import { toUTCISO, splitInZone, todayInZone, zoneLabel } from '@utils/calendar'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  job: { type: Object, default: null }, // null = create
  teams: { type: Array, default: () => [] },
  members: { type: Array, default: () => [] },
  defaultDate: { type: String, default: '' }, // YYYY-MM-DD
  // Pre-selected resource for a create (from clicking a resource's cell).
  defaultResourceType: { type: String, default: 'team' }, // 'team' | 'member'
  defaultResourceId: { type: [Number, String], default: '' },
})
const emit = defineEmits(['update:modelValue', 'saved'])

const jobs = useJobsStore()
const customers = useCustomersStore()
const auth = useAuthStore()
const messages = useMessagesStore()

// Times are entered in the company's zone; conversion to/from the stored UTC
// instant happens here so what the scheduler types is what everyone sees.
const tz = computed(() => auth.company?.timezone || 'UTC')

const isEdit = computed(() => !!props.job)
const form = ref(blank())
const saving = ref(false)
const error = ref('')

function blank() {
  return {
    resourceType: props.defaultResourceType || 'team',
    resourceId: props.defaultResourceId || '',
    customerId: '',
    siteId: '',
    title: '',
    description: '',
    location: '',
    confirmed: true,
    date: props.defaultDate || todayInZone(tz.value),
    start: '09:00',
    end: '10:00',
  }
}

// The resource select's options follow the chosen type.
const resourceItems = computed(() =>
  form.value.resourceType === 'member' ? props.members : props.teams,
)

// Sites offered follow the chosen customer.
const siteItems = computed(() => {
  const c = customers.items.find((x) => x.id === Number(form.value.customerId))
  return c?.sites || []
})
// Switching customer drops a site that no longer belongs to it.
function onCustomerChange() {
  form.value.siteId = ''
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    error.value = ''
    newComment.value = ''
    timeline.value = { comments: [], activity: [] }
    if (!customers.items.length) customers.fetch()
    attachments.value = []
    revokeThumbs()
    if (props.job) {
      loadTimeline()
      loadAttachments()
      const s = splitInZone(props.job.scheduled_start, tz.value)
      const e = splitInZone(props.job.scheduled_end, tz.value)
      form.value = {
        resourceType: props.job.member_id ? 'member' : 'team',
        resourceId: props.job.member_id || props.job.team_id,
        customerId: props.job.customer_id || '',
        siteId: props.job.site_id || '',
        title: props.job.title,
        description: props.job.description || '',
        location: props.job.location || '',
        confirmed: props.job.confirmed !== false,
        date: s.date,
        start: s.time,
        end: e.time,
      }
    } else {
      form.value = blank()
    }
  },
)

// Switching Team <-> Member clears the picked resource so a stale id can't leak.
function onResourceTypeChange() {
  form.value.resourceId = ''
}

// --- activity & comments (edit mode) ---
const timeline = ref({ comments: [], activity: [] })
const timelineLoading = ref(false)
const newComment = ref('')
const commentPosting = ref(false)

async function loadTimeline() {
  if (!props.job) return
  timelineLoading.value = true
  try {
    timeline.value = await jobs.timeline(props.job.id)
  } catch {
    // a timeline failure shouldn't block editing the job
    timeline.value = { comments: [], activity: [] }
  } finally {
    timelineLoading.value = false
  }
}

async function postComment() {
  const body = newComment.value.trim()
  if (!body) return
  commentPosting.value = true
  try {
    await jobs.addComment(props.job.id, body)
    newComment.value = ''
    await loadTimeline()
  } catch (err) {
    messages.error(err.message || t('toast.genericError'))
  } finally {
    commentPosting.value = false
  }
}

// Merge comments + activity into one reverse-chronological feed. The "commented"
// activity is dropped — the comment itself already shows.
const feed = computed(() => {
  const items = []
  for (const c of timeline.value.comments || []) {
    items.push({ id: 'c' + c.id, kind: 'comment', when: c.created_at, who: c.author_name, text: c.body })
  }
  for (const a of timeline.value.activity || []) {
    if (a.kind === 'commented') continue
    items.push({ id: 'a' + a.id, kind: 'activity', activityKind: a.kind, when: a.created_at, who: a.actor_name, text: a.detail })
  }
  return items.sort((x, y) => new Date(y.when) - new Date(x.when))
})
function activityIcon(kind) {
  return { created: '$addNew', status_changed: '$scheduled', updated: '$edit' }[kind] || '$history'
}
function whenLabel(iso) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// --- photo attachments (edit mode) ---
const attachments = ref([])
const thumbUrls = ref({})
const attLoading = ref(false)
const uploading = ref(false)

function revokeThumbs() {
  Object.values(thumbUrls.value).forEach((u) => {
    try {
      URL.revokeObjectURL(u)
    } catch {
      // ignore
    }
  })
  thumbUrls.value = {}
}
async function loadAttachments() {
  if (!props.job) return
  attLoading.value = true
  revokeThumbs()
  try {
    const res = await jobs.listAttachments(props.job.id)
    attachments.value = res.data || []
    for (const a of attachments.value) {
      jobs
        .attachmentObjectUrl(props.job.id, a.id)
        .then((url) => {
          thumbUrls.value = { ...thumbUrls.value, [a.id]: url }
        })
        .catch(() => {})
    }
  } catch {
    attachments.value = []
  } finally {
    attLoading.value = false
  }
}
async function onFiles(ev) {
  const files = [...(ev.target.files || [])].filter((f) => f.type.startsWith('image/'))
  ev.target.value = ''
  if (!files.length) return
  uploading.value = true
  try {
    for (const f of files) await jobs.uploadAttachment(props.job.id, f)
    await loadAttachments()
  } catch (err) {
    messages.error(err.message || t('toast.genericError'))
  } finally {
    uploading.value = false
  }
}
async function removeAttachment(id) {
  try {
    await jobs.removeAttachment(props.job.id, id)
    await loadAttachments()
  } catch (err) {
    messages.error(err.message || t('toast.genericError'))
  }
}
function openPhoto(a) {
  const url = thumbUrls.value[a.id]
  if (url) window.open(url, '_blank')
}
onUnmounted(revokeThumbs)

function close() {
  emit('update:modelValue', false)
}

async function save() {
  error.value = ''
  if (!form.value.resourceId || !form.value.title) {
    error.value = t('jobDialog.resourceRequired')
    return
  }
  const payload = {
    title: form.value.title,
    description: form.value.description,
    location: form.value.location,
    confirmed: form.value.confirmed,
    scheduled_start: toUTCISO(form.value.date, form.value.start, tz.value),
    scheduled_end: toUTCISO(form.value.date, form.value.end, tz.value),
  }
  if (form.value.resourceType === 'member') {
    payload.member_id = Number(form.value.resourceId)
  } else {
    payload.team_id = Number(form.value.resourceId)
  }
  // Customer / site. On edit, 0 explicitly clears; on create, omit when none.
  const cid = form.value.customerId ? Number(form.value.customerId) : 0
  const sid = form.value.siteId ? Number(form.value.siteId) : 0
  if (isEdit.value) {
    payload.customer_id = cid
    payload.site_id = sid
  } else {
    if (cid) payload.customer_id = cid
    if (sid) payload.site_id = sid
  }

  saving.value = true
  try {
    if (isEdit.value) {
      await jobs.update(props.job.id, payload)
      messages.success(t('toast.jobUpdated'))
    } else {
      await jobs.create(payload)
      messages.success(t('toast.jobScheduled'))
    }
    emit('saved')
    close()
  } catch (err) {
    // A 409 is the double-booking guard — keep the dialog open and show which
    // job conflicts so the user can pick another slot.
    if (err.status === 409) error.value = err.message
    else if (err.status === 400) error.value = t('jobDialog.checkTimes')
    else error.value = err.message || t('jobDialog.couldNotSave')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="560" @update:model-value="close">
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center pa-4">
        <v-icon icon="$job" class="mr-2" />
        {{ isEdit ? $t('jobDialog.editJob') : $t('jobDialog.scheduleJob') }}
        <v-spacer />
        <v-btn icon="$close" variant="text" density="comfortable" @click="close" />
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4">
        <!-- Resource: a team OR an individual member -->
        <div class="d-flex align-center mb-3" style="gap: 12px">
          <v-btn-toggle
            v-model="form.resourceType"
            density="comfortable"
            variant="outlined"
            divided
            mandatory
            :disabled="saving"
            @update:model-value="onResourceTypeChange"
          >
            <v-btn value="team" prepend-icon="$teams">{{ $t('jobDialog.team') }}</v-btn>
            <v-btn value="member" prepend-icon="$account">{{ $t('jobDialog.member') }}</v-btn>
          </v-btn-toggle>
          <v-select
            v-model="form.resourceId"
            :items="resourceItems"
            item-title="name"
            item-value="id"
            :label="form.resourceType === 'member' ? $t('jobDialog.member') : $t('jobDialog.team')"
            :prepend-inner-icon="form.resourceType === 'member' ? '$account' : '$teams'"
            variant="outlined"
            density="comfortable"
            hide-details
            :disabled="saving"
            class="flex-grow-1"
          />
        </div>

        <v-text-field
          v-model="form.title"
          :label="$t('jobDialog.title')"
          prepend-inner-icon="$job"
          variant="outlined"
          :disabled="saving"
        />
        <v-textarea
          v-model="form.description"
          :label="$t('jobDialog.description')"
          variant="outlined"
          rows="2"
          auto-grow
          :disabled="saving"
        />

        <!-- Customer + site: who the job is for and where. -->
        <v-row dense>
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.customerId"
              :items="customers.items"
              item-title="name"
              item-value="id"
              :label="$t('jobDialog.customer')"
              prepend-inner-icon="$company"
              variant="outlined"
              clearable
              hide-details
              :disabled="saving"
              @update:model-value="onCustomerChange"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.siteId"
              :items="siteItems"
              item-title="label"
              item-value="id"
              :label="$t('jobDialog.site')"
              prepend-inner-icon="$location"
              variant="outlined"
              clearable
              hide-details
              :disabled="saving || !form.customerId"
              :no-data-text="form.customerId ? $t('jobDialog.noSitesForCustomer') : $t('jobDialog.pickCustomerFirst')"
            />
          </v-col>
        </v-row>
        <v-text-field
          v-model="form.location"
          :label="$t('jobDialog.locationNote')"
          :hint="$t('jobDialog.locationHint')"
          prepend-inner-icon="$location"
          variant="outlined"
          class="mt-3"
          :disabled="saving"
        />
        <v-row dense>
          <v-col cols="12" sm="4">
            <v-text-field v-model="form.date" :label="$t('jobDialog.date')" type="date" variant="outlined" :disabled="saving" />
          </v-col>
          <v-col cols="6" sm="4">
            <v-text-field v-model="form.start" :label="$t('jobDialog.start')" type="time" variant="outlined" :disabled="saving" />
          </v-col>
          <v-col cols="6" sm="4">
            <v-text-field v-model="form.end" :label="$t('jobDialog.end')" type="time" variant="outlined" :disabled="saving" />
          </v-col>
        </v-row>
        <div class="text-caption text-medium-emphasis mb-2">
          <v-icon icon="$schedule" size="x-small" /> {{ $t('jobDialog.timesInZone', { zone: zoneLabel(tz) }) }}
        </div>

        <v-switch
          v-model="form.confirmed"
          :label="form.confirmed ? $t('jobStatus.confirmed') : $t('jobStatus.tentative')"
          :color="form.confirmed ? 'success' : 'warning'"
          density="comfortable"
          hide-details
          :disabled="saving"
        />

        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-1">
          {{ error }}
        </v-alert>

        <!-- Photos (edit only) -->
        <template v-if="isEdit">
          <v-divider class="my-4" />
          <div class="text-overline text-medium-emphasis mb-2">{{ $t('jobDialog.photos') }}</div>
          <div class="photo-grid">
            <div v-for="a in attachments" :key="a.id" class="photo-cell">
              <img
                v-if="thumbUrls[a.id]"
                :src="thumbUrls[a.id]"
                class="photo-thumb"
                :title="a.filename"
                @click="openPhoto(a)"
              />
              <div v-else class="photo-thumb photo-loading">
                <v-progress-circular indeterminate size="18" width="2" color="primary" />
              </div>
              <v-btn
                icon="$delete"
                size="x-small"
                variant="flat"
                color="error"
                class="photo-del"
                @click.stop="removeAttachment(a.id)"
              />
            </div>
            <label class="photo-add" :class="{ 'photo-add--busy': uploading }">
              <input type="file" accept="image/*" multiple hidden :disabled="uploading" @change="onFiles" />
              <v-progress-circular v-if="uploading" indeterminate size="18" width="2" color="primary" />
              <template v-else>
                <v-icon icon="$addNew" size="small" />
                <span class="text-caption">{{ $t('common.add') }}</span>
              </template>
            </label>
          </div>
          <p v-if="!attLoading && !attachments.length && !uploading" class="text-caption text-medium-emphasis mt-1 mb-0">
            {{ $t('jobDialog.noPhotos') }}
          </p>
        </template>

        <!-- Activity & comments (edit only) -->
        <template v-if="isEdit">
          <v-divider class="my-4" />
          <div class="text-overline text-medium-emphasis mb-2">{{ $t('jobDialog.activityComments') }}</div>
          <div class="d-flex align-center mb-3" style="gap: 8px">
            <v-text-field
              v-model="newComment"
              :placeholder="$t('jobDialog.addComment')"
              density="compact"
              variant="outlined"
              hide-details
              :disabled="commentPosting"
              @keyup.enter="postComment"
            />
            <v-btn
              color="primary"
              variant="tonal"
              size="small"
              :loading="commentPosting"
              :disabled="!newComment.trim()"
              @click="postComment"
            >
              {{ $t('jobDialog.comment') }}
            </v-btn>
          </div>

          <div v-if="timelineLoading" class="text-center py-3">
            <v-progress-circular indeterminate size="20" width="2" color="primary" />
          </div>
          <div v-else-if="feed.length" class="job-feed">
            <div v-for="item in feed" :key="item.id" class="feed-row">
              <v-icon
                :icon="item.kind === 'comment' ? '$account' : activityIcon(item.activityKind)"
                size="x-small"
                class="feed-icon text-medium-emphasis"
              />
              <div class="feed-body">
                <div class="text-body-2">
                  <strong v-if="item.who">{{ item.who }}</strong>
                  <span v-if="item.kind === 'activity'" class="text-medium-emphasis"> {{ item.text }}</span>
                </div>
                <div v-if="item.kind === 'comment'" class="text-body-2">{{ item.text }}</div>
                <div class="text-caption text-medium-emphasis">{{ whenLabel(item.when) }}</div>
              </div>
            </div>
          </div>
          <p v-else class="text-caption text-medium-emphasis mb-0">No activity yet.</p>
        </template>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="close">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :loading="saving" @click="save">
          {{ isEdit ? $t('common.save') : $t('jobDialog.schedule') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Photo attachments */
.photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.photo-cell {
  position: relative;
  width: 72px;
  height: 72px;
}
.photo-thumb {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-border-color), 0.2);
  cursor: pointer;
  display: block;
}
.photo-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.photo-del {
  position: absolute;
  top: -6px;
  right: -6px;
}
.photo-add {
  width: 72px;
  height: 72px;
  border: 1px dashed rgba(var(--v-border-color), 0.5);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.6);
  transition: border-color 0.15s, background 0.15s;
}
.photo-add:hover {
  border-color: rgba(var(--v-theme-primary), 0.6);
  background: rgba(var(--v-theme-primary), 0.04);
}
.photo-add--busy {
  pointer-events: none;
}

.job-feed {
  max-height: 220px;
  overflow-y: auto;
}
.feed-row {
  display: flex;
  gap: 10px;
  padding: 6px 0;
}
.feed-row + .feed-row {
  border-top: 1px solid rgba(var(--v-border-color), 0.1);
}
.feed-icon {
  margin-top: 3px;
  flex: 0 0 auto;
}
.feed-body {
  min-width: 0;
}
</style>
