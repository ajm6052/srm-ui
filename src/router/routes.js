import { useAuthStore } from '@stores/auth'

// Route table. Views are lazy-loaded so each screen is its own chunk.
// `meta.authRequired` gates a route behind a session; `meta.permission` behind a
// company permission; `meta.platformAdmin` behind the admin flag. The guard in
// ./index.js enforces all three.
export default [
  {
    path: '/',
    redirect: { name: 'schedule' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@views/login.vue'),
    meta: {
      beforeResolve(routeTo, routeFrom, next) {
        // Already signed in? Skip the login screen.
        if (useAuthStore().loggedIn) next({ name: 'schedule' })
        else next()
      },
    },
  },
  {
    path: '/logout',
    name: 'logout',
    meta: {
      beforeResolve(routeTo, routeFrom, next) {
        useAuthStore().logOut()
        next({ name: 'login' })
      },
    },
    component: { render: () => null },
  },
  {
    path: '/select-workspace',
    name: 'select-workspace',
    component: () => import('@views/select-workspace.vue'),
    meta: { authRequired: true },
  },
  {
    path: '/schedule',
    name: 'schedule',
    component: () => import('@views/schedule.vue'),
    // platformStaffOk: staff have no company of their own but still open the
    // schedule — as the read-only cross-company board — so they bypass the
    // company/permission gate below.
    meta: { authRequired: true, permission: 'jobs:view', platformStaffOk: true },
  },
  {
    path: '/teams',
    name: 'teams',
    component: () => import('@views/teams.vue'),
    // crossCompanyOk: platform staff (no company) get the read-only cross-company
    // list — the API scopes support to its assigned companies.
    meta: { authRequired: true, permission: 'teams:view', crossCompanyOk: true },
  },
  {
    path: '/users',
    name: 'users',
    component: () => import('@views/users.vue'),
    meta: { authRequired: true, permission: 'users:view', crossCompanyOk: true },
  },
  {
    path: '/customers',
    name: 'customers',
    component: () => import('@views/customers.vue'),
    meta: { authRequired: true, permission: 'customers:view', crossCompanyOk: true },
  },
  {
    path: '/reports',
    name: 'reports',
    component: () => import('@views/reports.vue'),
    meta: { authRequired: true, permission: 'reports:view', crossCompanyOk: true },
  },
  {
    path: '/support',
    name: 'support',
    component: () => import('@views/support.vue'),
    // companyOnly: the per-company desk isn't for platform staff (they triage in
    // the admin panel); the guard redirects them there.
    meta: { authRequired: true, permission: 'support:create', companyOnly: true },
  },
  {
    path: '/permissions',
    name: 'permissions',
    component: () => import('@views/permissions.vue'),
    // Reference screen for owners and platform staff (support/superadmin) — the
    // same reach as the API's RequireOwnerOrStaff gate. See ownerOrStaff in the
    // router guard.
    meta: { authRequired: true, ownerOrStaff: true },
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@views/admin.vue'),
    meta: { authRequired: true, platformAdmin: true },
  },
  {
    path: '/admin/companies/:id',
    name: 'admin-company',
    component: () => import('@views/admin-company.vue'),
    meta: { authRequired: true, platformAdmin: true },
    props: (route) => ({ id: Number(route.params.id) }),
  },
  {
    path: '/404',
    name: '404',
    component: () => import('@views/_404.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: { name: '404' },
  },
]
