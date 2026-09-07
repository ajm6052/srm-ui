// Verifies the English and Spanish message catalogs have exactly the same keys,
// so a translation is never silently missing (vue-i18n would fall back and the UI
// would show English in a Spanish session, or a raw key). Run in CI.
//
// The catalogs are ESM `export default { ... }` object literals; to stay
// independent of Node's module resolution / version, we read the source and
// evaluate the default-exported object directly.
import { readFileSync } from 'node:fs'

function loadCatalog(relPath) {
  const src = readFileSync(new URL(relPath, import.meta.url), 'utf8')
  const body = src.replace(/^\s*export\s+default\s+/m, 'return ')
  // eslint-disable-next-line no-new-func
  return new Function(body)()
}

// Recursively collect dotted key paths for every leaf (string) value.
function keys(obj, prefix = '') {
  const out = []
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...keys(v, path))
    else out.push(path)
  }
  return out
}

const en = loadCatalog('../src/i18n/en.js')
const es = loadCatalog('../src/i18n/es.js')

const enKeys = new Set(keys(en))
const esKeys = new Set(keys(es))
const missingInEs = [...enKeys].filter((k) => !esKeys.has(k)).sort()
const missingInEn = [...esKeys].filter((k) => !enKeys.has(k)).sort()

let failed = false
if (missingInEs.length) {
  failed = true
  console.error(`\n✗ ${missingInEs.length} key(s) present in en.js but missing in es.js:`)
  for (const k of missingInEs) console.error(`    ${k}`)
}
if (missingInEn.length) {
  failed = true
  console.error(`\n✗ ${missingInEn.length} key(s) present in es.js but missing in en.js:`)
  for (const k of missingInEn) console.error(`    ${k}`)
}

if (failed) {
  console.error('\ni18n catalog check failed — keys must match across locales.\n')
  process.exit(1)
}
console.log(`✓ i18n catalogs match — ${enKeys.size} keys in both en.js and es.js.`)
