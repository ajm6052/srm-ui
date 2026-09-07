import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n'
import { useI18n } from 'vue-i18n'
import { i18n } from '@i18n'
import { aliases as mdiAliases, mdi } from 'vuetify/iconsets/mdi-svg'
import {
  mdiAccountCircle,
  mdiAccountGroupOutline,
  mdiAccountHardHatOutline,
  mdiAccountMultipleOutline,
  mdiAlertCircleOutline,
  mdiArrowLeft,
  mdiBellOutline,
  mdiChartBoxOutline,
  mdiCalendarBlankOutline,
  mdiCalendarClock,
  mdiCalendarTextOutline,
  mdiCalendarWeekOutline,
  mdiCheckCircleOutline,
  mdiChevronLeft,
  mdiChevronRight,
  mdiClose,
  mdiCogOutline,
  mdiDomain,
  mdiDotsVertical,
  mdiExitToApp,
  mdiEye,
  mdiEyeOff,
  mdiLifebuoy,
  mdiMapMarkerOutline,
  mdiPauseCircleOutline,
  mdiPencilOutline,
  mdiPlus,
  mdiProgressClock,
  mdiRefresh,
  mdiShieldAccountOutline,
  mdiShieldKeyOutline,
  mdiTrashCanOutline,
  mdiViewDashboardOutline,
  mdiHistory,
  mdiKeyOutline,
  mdiTrayArrowDown,
} from '@mdi/js'

// App-specific icon aliases, referenced in templates as `$schedule`, `$teams`, …
const customAliases = {
  account: mdiAccountCircle,
  admin: mdiShieldAccountOutline,
  addNew: mdiPlus,
  back: mdiArrowLeft,
  cancel: mdiClose,
  close: mdiClose,
  company: mdiDomain,
  dashboard: mdiViewDashboardOutline,
  download: mdiTrayArrowDown,
  history: mdiHistory,
  superadmin: mdiShieldAccountOutline,
  permissions: mdiShieldKeyOutline,
  key: mdiKeyOutline,
  // (mdiShieldAccountOutline is imported once for the `admin` alias above)
  delete: mdiTrashCanOutline,
  edit: mdiPencilOutline,
  hide: mdiEyeOff,
  job: mdiCalendarClock,
  bell: mdiBellOutline,
  reports: mdiChartBoxOutline,
  leader: mdiAccountHardHatOutline,
  location: mdiMapMarkerOutline,
  logout: mdiExitToApp,
  members: mdiAccountMultipleOutline,
  menu: mdiDotsVertical,
  prevDay: mdiChevronLeft,
  nextDay: mdiChevronRight,
  refresh: mdiRefresh,
  schedule: mdiCalendarBlankOutline,
  settings: mdiCogOutline,
  viewDay: mdiCalendarTextOutline,
  viewWeek: mdiCalendarWeekOutline,
  show: mdiEye,
  support: mdiLifebuoy,
  teams: mdiAccountGroupOutline,
  users: mdiAccountMultipleOutline,
  // Job status.
  scheduled: mdiCalendarClock,
  inProgress: mdiProgressClock,
  completed: mdiCheckCircleOutline,
  cancelled: mdiPauseCircleOutline,
  alert: mdiAlertCircleOutline,
}

export default createVuetify({
  // Bridge Vuetify's own component strings (data-table footer, pagination, …) to
  // vue-i18n, so they translate alongside the app when the language changes.
  locale: {
    adapter: createVueI18nAdapter({ i18n, useI18n }),
  },
  icons: {
    defaultSet: 'mdi',
    aliases: { ...mdiAliases, ...customAliases },
    sets: { mdi },
  },
  // App-wide component defaults, so the UI reads as one system: outlined, roomy
  // inputs; softly rounded cards; text buttons that aren't shouty. Explicit props
  // on a component still win, so per-screen overrides are unaffected.
  defaults: {
    VCard: { rounded: 'lg' },
    VTextField: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VSelect: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VTextarea: { variant: 'outlined', density: 'comfortable', color: 'primary' },
    VChip: { rounded: 'md' },
    VDataTable: { hover: true },
    VDataTableServer: { hover: true },
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        // A restrained, professional palette: indigo primary + slate neutrals on
        // an off-white ground, with softened text/border emphasis.
        colors: {
          background: '#f6f7f9',
          surface: '#ffffff',
          'surface-variant': '#e9ecf2',
          'on-surface-variant': '#454b54',
          'on-surface': '#0f172a',
          'on-background': '#0f172a',
          primary: '#4f46e5',
          'primary-darken-1': '#4338ca',
          secondary: '#64748b',
          accent: '#0ea5e9',
          error: '#dc2626',
          info: '#2563eb',
          success: '#16a34a',
          warning: '#d97706',
        },
        variables: {
          'border-color': '#334155',
          'border-opacity': 0.12,
          'high-emphasis-opacity': 0.88,
          'medium-emphasis-opacity': 0.6,
        },
      },
    },
  },
})
