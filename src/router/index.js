import { createRouter, createWebHistory } from 'vue-router'
import routes from './routes'
import { useAuthStore } from '@stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    return savedPosition || { top: 0, left: 0 }
  },
})

// Auth + authorization gate. A route may declare authRequired (needs a session),
// permission (needs a company permission), and/or platformAdmin (needs the admin
// flag). Missing a session bounces to login remembering the destination; holding
// a session but lacking the permission bounces to the schedule rather than
// showing a screen the API would only 403.
router.beforeEach((routeTo, routeFrom, next) => {
  const auth = useAuthStore()

  if (routeTo.matched.some((r) => r.meta.authRequired) && !auth.loggedIn) {
    return next({ name: 'login', query: { redirectFrom: routeTo.fullPath } })
  }
  // /admin requires platform staff.
  if (routeTo.meta.platformAdmin && !auth.isPlatformStaff) {
    return next(auth.homeRoute)
  }
  // The Permissions reference is for owners and platform staff.
  if (routeTo.meta.ownerOrStaff && auth.loggedIn && !auth.canViewPermissions) {
    return next(auth.homeRoute)
  }
  // Company routes: platform-only staff (no company) belong in the admin panel;
  // a company user lacking the permission goes to their home. Routes flagged
  // platformStaffOk (the schedule) instead admit staff, who get a read-only
  // cross-company view of it.
  if (routeTo.meta.permission && auth.loggedIn) {
    if (routeTo.meta.platformStaffOk && auth.isPlatformStaff) return next()
    if (!auth.hasCompany) return next({ name: 'admin' })
    if (!auth.can(routeTo.meta.permission)) return next({ name: 'schedule' })
  }
  return next()
})

// Per-route beforeResolve hooks (used by login/register/logout).
router.beforeResolve(async (routeTo, routeFrom, next) => {
  try {
    for (const route of routeTo.matched) {
      await new Promise((resolve, reject) => {
        if (route.meta && route.meta.beforeResolve) {
          route.meta.beforeResolve(routeTo, routeFrom, (...args) => {
            if (args.length) {
              next(...args)
              reject(new Error('Redirected'))
            } else {
              resolve()
            }
          })
        } else {
          resolve()
        }
      })
    }
  } catch {
    return
  }
  next()
})

export default router
