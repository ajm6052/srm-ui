import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@stores/auth'

// The auth store's getters are the client-side mirror of the API's permission
// gates — a wrong answer here means a control shows (or hides) when it shouldn't.
describe('auth store permission getters', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('can() grants a held permission and denies an unheld one', () => {
    const auth = useAuthStore()
    auth.$patch({ user: { role: 'scheduler' }, permissions: ['jobs:manage', 'jobs:view'] })
    expect(auth.can('jobs:manage')).toBe(true)
    expect(auth.can('users:manage')).toBe(false)
  })

  it('a superadmin can() do anything, regardless of the permission list', () => {
    const auth = useAuthStore()
    auth.$patch({ user: { is_super_admin: true, is_platform_staff: true }, permissions: [] })
    expect(auth.can('users:manage')).toBe(true)
    expect(auth.can('anything:at:all')).toBe(true)
  })

  it('canViewPermissions is limited to owners and platform staff', () => {
    const auth = useAuthStore()
    auth.$patch({ user: { role: 'owner' } })
    expect(auth.canViewPermissions).toBe(true)

    auth.$patch({ user: { role: 'member', is_platform_staff: false } })
    expect(auth.canViewPermissions).toBe(false)

    auth.$patch({ user: { role: '', is_platform_staff: true } })
    expect(auth.canViewPermissions).toBe(true)
  })

  it('reflects platform role flags from the user', () => {
    const auth = useAuthStore()
    expect(auth.isSuperAdmin).toBe(false)
    expect(auth.isPlatformStaff).toBe(false)
    auth.$patch({ user: { is_super_admin: true, is_platform_staff: true } })
    expect(auth.isSuperAdmin).toBe(true)
    expect(auth.isPlatformStaff).toBe(true)
  })

  it('hasMultipleWorkspaces only when more than one membership', () => {
    const auth = useAuthStore()
    expect(auth.hasMultipleWorkspaces).toBe(false)
    auth.$patch({ memberships: [{ company_id: 1 }] })
    expect(auth.hasMultipleWorkspaces).toBe(false)
    auth.$patch({ memberships: [{ company_id: 1 }, { company_id: 2 }] })
    expect(auth.hasMultipleWorkspaces).toBe(true)
  })

  it('routes company users to the schedule and platform-only staff to admin', () => {
    const auth = useAuthStore()
    expect(auth.homeRoute).toEqual({ name: 'admin' }) // no company yet
    auth.$patch({ company: { id: 7 } })
    expect(auth.homeRoute).toEqual({ name: 'schedule' })
  })

  it('loggedIn tracks whether a user is loaded', () => {
    const auth = useAuthStore()
    expect(auth.loggedIn).toBe(false)
    auth.$patch({ user: { role: 'member' } })
    expect(auth.loggedIn).toBe(true)
  })
})
