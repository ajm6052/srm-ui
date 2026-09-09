import { computed, ref } from 'vue'
import { useAuthStore } from '@stores/auth'

// Shared state for the platform operator's cross-company screens (Teams / Users /
// Customers / Reports):
//   - cross:     whether this session is in cross-company mode (company-less staff)
//   - companyId: the selected company filter (null = every company they may see)
//   - companies: a STABLE, accumulating [{ id, name }] list to offer as filter
//                options, built from rows as they load so narrowing the filter
//                never shrinks the list of choices
//
// The API resolves the actual reach (a superadmin spans every company; a support
// agent only its assigned ones), so these views never decide access themselves.
export function useCrossCompany() {
  const auth = useAuthStore()
  const cross = computed(() => auth.crossCompany)
  const companyId = ref(null)
  const companies = ref([])

  // mergeCompanies folds any {id, name} companies present in freshly-loaded data
  // into the stable options list (deduped, name-sorted). Rows from a normal
  // single-company session carry no company and are simply ignored.
  function mergeCompanies(list) {
    const seen = new Set(companies.value.map((c) => c.id))
    let added = false
    for (const c of list || []) {
      if (c && c.id != null && !seen.has(c.id)) {
        companies.value.push({ id: c.id, name: c.name })
        seen.add(c.id)
        added = true
      }
    }
    if (added) companies.value.sort((a, b) => a.name.localeCompare(b.name))
  }

  return { cross, companyId, companies, mergeCompanies }
}
