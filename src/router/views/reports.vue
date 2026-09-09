<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useReportsStore } from '@stores/reports'
import { useMessagesStore } from '@stores/messages'
import { useCrossCompany } from '@src/composables/useCrossCompany'
import CompanyFilter from '@components/company-filter.vue'
import { download } from '@utils/api'
import { statusColor } from '@utils/calendar'

const reports = useReportsStore()
const messages = useMessagesStore()
const { t } = useI18n({ useScope: 'global' })

// Cross-company (platform operator) mode: totals across companies, with a
// by-company breakdown; picking a company narrows to its own full report.
const { cross, companyId, companies, mergeCompanies } = useCrossCompany()

// Default window: the last 30 days through today.
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
const from = ref(daysAgo(30))
const to = ref(new Date().toISOString().slice(0, 10))

async function load() {
  // `to` is inclusive in the UI; the API window is [from, to) so add a day.
  const toExclusive = new Date(to.value + 'T00:00:00')
  toExclusive.setDate(toExclusive.getDate() + 1)
  await reports.fetch({ from: from.value, to: toExclusive.toISOString().slice(0, 10), companyId: companyId.value })
  // The all-companies report lists every company in by_company; capture them as
  // stable filter options (a narrowed report returns none, so this never shrinks).
  if (cross.value) mergeCompanies(reports.data?.by_company)
}
onMounted(load)
watch(companyId, load)

const d = computed(
  () => reports.data || { total: 0, by_status: {}, by_team: [], by_member: [], by_customer: [], by_company: [] },
)
// The by-company breakdown replaces the per-company charts only when viewing ALL
// companies; drilling into one shows that company's own team/member/customer bars.
const showByCompany = computed(() => cross.value && companyId.value == null)

// KPI tiles from the status breakdown.
const kpis = computed(() => {
  const s = d.value.by_status || {}
  return [
    { label: t('reports.totalJobs'), value: d.value.total || 0, color: 'primary' },
    { label: t('reports.completed'), value: s.completed || 0, color: 'success' },
    { label: t('reports.inProgress'), value: s.in_progress || 0, color: 'warning' },
    { label: t('reports.cancelled'), value: s.cancelled || 0, color: 'grey' },
  ]
})

// Jobs-by-status as ordered, colour-coded bars.
const STATUS_ORDER = ['scheduled', 'in_progress', 'completed', 'cancelled']
const statusBars = computed(() =>
  STATUS_ORDER.map((k) => ({ name: t('jobStatus.' + k), count: d.value.by_status?.[k] || 0, color: statusColor[k] })).filter(
    (b) => b.count > 0,
  ),
)

// Magnitude comparisons use a single primary hue (one measure across categories).
const PRIMARY = '#4f46e5'
function barPct(count, rows) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return Math.round((count / max) * 100)
}
const hasData = computed(() => (d.value.total || 0) > 0)

// Export the current window as CSV or PDF. Same [from, to) the dashboard
// requests, so the file matches what's on screen. `exporting` holds the format
// currently downloading ('' when idle) so each button shows its own spinner.
const exporting = ref('')
async function exportReport(format) {
  exporting.value = format
  try {
    const toExclusive = new Date(to.value + 'T00:00:00')
    toExclusive.setDate(toExclusive.getDate() + 1)
    const params = { from: from.value, to: toExclusive.toISOString().slice(0, 10) }
    if (companyId.value != null) params.company_id = companyId.value
    if (format === 'pdf') params.format = 'pdf'
    await download('/api/reports/export', `srm-report_${from.value}_${to.value}.${format}`, { params })
  } catch (err) {
    messages.error(err.message || t('toast.genericError'))
  } finally {
    exporting.value = ''
  }
}
</script>

<template>
  <v-container fluid class="pa-4 pa-md-6">
    <div class="d-flex flex-wrap align-center mb-4" style="gap: 12px">
      <div>
        <h1 class="text-h5 font-weight-bold">{{ $t('reports.title') }}</h1>
        <div class="text-medium-emphasis">{{ $t('reports.subtitle') }}</div>
      </div>
      <v-chip v-if="cross" size="small" color="deep-purple" variant="tonal" prepend-icon="$admin">
        {{ $t('common.crossCompanyReadOnly') }}
      </v-chip>
      <v-spacer />
      <company-filter v-if="cross" v-model="companyId" :companies="companies" />
      <v-text-field
        v-model="from"
        type="date"
        :label="$t('reports.from')"
        variant="outlined"
        density="compact"
        hide-details
        style="max-width: 170px"
        @update:model-value="load"
      />
      <v-text-field
        v-model="to"
        type="date"
        :label="$t('reports.to')"
        variant="outlined"
        density="compact"
        hide-details
        style="max-width: 170px"
        @update:model-value="load"
      />
      <v-btn icon="$refresh" variant="text" :loading="reports.loading" @click="load" />
      <v-btn
        variant="tonal"
        color="primary"
        prepend-icon="$download"
        :loading="exporting === 'csv'"
        :disabled="!hasData || (!!exporting && exporting !== 'csv')"
        @click="exportReport('csv')"
      >
        {{ $t('reports.exportCsv') }}
      </v-btn>
      <v-btn
        variant="outlined"
        color="primary"
        prepend-icon="$download"
        :loading="exporting === 'pdf'"
        :disabled="!hasData || (!!exporting && exporting !== 'pdf')"
        @click="exportReport('pdf')"
      >
        {{ $t('reports.exportPdf') }}
      </v-btn>
    </div>

    <!-- KPI tiles -->
    <v-row>
      <v-col v-for="k in kpis" :key="k.label" cols="6" md="3">
        <v-card rounded="lg" variant="outlined" class="pa-4 h-100">
          <div class="text-h4 font-weight-bold" :class="`text-${k.color}`">{{ k.value }}</div>
          <div class="text-body-2 text-medium-emphasis">{{ k.label }}</div>
        </v-card>
      </v-col>
    </v-row>

    <v-alert v-if="!reports.loading && !hasData" type="info" variant="tonal" class="mt-4">
      {{ $t('reports.noData') }}
    </v-alert>

    <template v-else>
      <v-row class="mt-1">
        <v-col cols="12" md="6">
          <v-card rounded="lg" variant="outlined" class="h-100">
            <v-card-title class="text-subtitle-1">{{ $t('reports.byStatus') }}</v-card-title>
            <v-divider />
            <v-card-text>
              <div v-for="b in statusBars" :key="b.name" class="bar-row">
                <div class="bar-label">{{ b.name }}</div>
                <div class="bar-track">
                  <div class="bar-fill" :style="{ width: barPct(b.count, statusBars) + '%', background: b.color }" />
                </div>
                <div class="bar-count">{{ b.count }}</div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="6">
          <!-- Cross-company (all): jobs per company. Otherwise: jobs per team. -->
          <v-card v-if="showByCompany" rounded="lg" variant="outlined" class="h-100">
            <v-card-title class="text-subtitle-1">{{ $t('reports.byCompany') }}</v-card-title>
            <v-divider />
            <v-card-text>
              <div v-if="d.by_company.length">
                <div v-for="b in d.by_company" :key="b.id" class="bar-row">
                  <div class="bar-label text-truncate">{{ b.name }}</div>
                  <div class="bar-track">
                    <div class="bar-fill" :style="{ width: barPct(b.count, d.by_company) + '%', background: PRIMARY }" />
                  </div>
                  <div class="bar-count">{{ b.count }}</div>
                </div>
              </div>
              <p v-else class="text-caption text-medium-emphasis mb-0">{{ $t('reports.noData') }}</p>
            </v-card-text>
          </v-card>
          <v-card v-else rounded="lg" variant="outlined" class="h-100">
            <v-card-title class="text-subtitle-1">{{ $t('reports.byTeam') }}</v-card-title>
            <v-divider />
            <v-card-text>
              <div v-if="d.by_team.length">
                <div v-for="b in d.by_team" :key="b.name" class="bar-row">
                  <div class="bar-label text-truncate">{{ b.name }}</div>
                  <div class="bar-track">
                    <div class="bar-fill" :style="{ width: barPct(b.count, d.by_team) + '%', background: PRIMARY }" />
                  </div>
                  <div class="bar-count">{{ b.count }}</div>
                </div>
              </div>
              <p v-else class="text-caption text-medium-emphasis mb-0">{{ $t('reports.noTeamJobs') }}</p>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-row v-if="!showByCompany" class="mt-1">
        <v-col cols="12" md="6">
          <v-card rounded="lg" variant="outlined" class="h-100">
            <v-card-title class="text-subtitle-1">{{ $t('reports.byMember') }}</v-card-title>
            <v-divider />
            <v-card-text>
              <div v-if="d.by_member.length">
                <div v-for="b in d.by_member" :key="b.name" class="bar-row">
                  <div class="bar-label text-truncate">{{ b.name }}</div>
                  <div class="bar-track">
                    <div class="bar-fill" :style="{ width: barPct(b.count, d.by_member) + '%', background: PRIMARY }" />
                  </div>
                  <div class="bar-count">{{ b.count }}</div>
                </div>
              </div>
              <p v-else class="text-caption text-medium-emphasis mb-0">{{ $t('reports.noMemberJobs') }}</p>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="6">
          <v-card rounded="lg" variant="outlined" class="h-100">
            <v-card-title class="text-subtitle-1">{{ $t('reports.topCustomers') }}</v-card-title>
            <v-divider />
            <v-card-text>
              <div v-if="d.by_customer.length">
                <div v-for="b in d.by_customer.slice(0, 8)" :key="b.name" class="bar-row">
                  <div class="bar-label text-truncate">{{ b.name }}</div>
                  <div class="bar-track">
                    <div class="bar-fill" :style="{ width: barPct(b.count, d.by_customer) + '%', background: PRIMARY }" />
                  </div>
                  <div class="bar-count">{{ b.count }}</div>
                </div>
              </div>
              <p v-else class="text-caption text-medium-emphasis mb-0">{{ $t('reports.noCustomerJobs') }}</p>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>

<style scoped>
.bar-row {
  display: grid;
  grid-template-columns: 130px 1fr 40px;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
}
.bar-label {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.75);
}
.bar-track {
  background: rgba(var(--v-theme-on-surface), 0.06);
  border-radius: 4px;
  height: 12px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 4px;
  min-width: 3px;
  transition: width 0.25s ease;
}
.bar-count {
  font-size: 0.8125rem;
  font-weight: 600;
  text-align: right;
  color: rgba(var(--v-theme-on-surface), 0.8);
}
</style>
