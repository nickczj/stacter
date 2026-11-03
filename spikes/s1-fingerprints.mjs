// Spike S1: what's in the webappanalyzer fingerprint data?
// Usage: node spikes/s1-fingerprints.mjs <path-to-webappanalyzer-checkout>
// Prints counts, per-field pattern usage, static vs rendered-only coverage,
// whether every pattern compiles as a JS RegExp, and the category list.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const repo = process.argv[2]
if (!repo) throw new Error('usage: node spikes/s1-fingerprints.mjs <webappanalyzer-checkout>')

const readJson = path => JSON.parse(readFileSync(join(repo, path), 'utf8'))
const categories = readJson('src/categories.json')
const groups = readJson('src/groups.json')
const techs = {}
for (const file of readdirSync(join(repo, 'src/technologies')).filter(f => f.endsWith('.json'))) {
  Object.assign(techs, readJson(`src/technologies/${file}`))
}

const asArray = v => (v === undefined ? [] : Array.isArray(v) ? v : [v])
// Fields a plain fetch can see. `js`, `xhr` and DOM `properties` need a browser.
const STATIC_FIELDS = new Set(['headers', 'cookies', 'meta', 'html', 'text', 'url', 'robots', 'scriptSrc', 'scripts', 'dns', 'css', 'certIssuer'])
const KEYED_FIELDS = ['headers', 'cookies', 'meta', 'js', 'probe', 'dns']
const LIST_FIELDS = ['html', 'text', 'css', 'robots', 'scriptSrc', 'scripts', 'url', 'xhr']

const patternsByField = {}
const badRegex = []
const tags = {}
let staticDetectable = 0
let renderedOnly = 0
let relationsOnly = 0

function addPattern(tech, field, raw) {
  patternsByField[field] = (patternsByField[field] ?? 0) + 1
  const [source, ...rest] = String(raw).split('\\;')
  for (const tag of rest) tags[tag.split(':')[0]] = (tags[tag.split(':')[0]] ?? 0) + 1
  try {
    new RegExp(source, 'i')
  }
  catch (error) {
    badRegex.push({ tech, field, source, error: String(error) })
  }
}

for (const [name, t] of Object.entries(techs)) {
  const fields = new Set()
  for (const field of LIST_FIELDS) {
    for (const raw of asArray(t[field])) addPattern(name, field, raw)
    if (t[field] !== undefined) fields.add(field)
  }
  for (const field of KEYED_FIELDS) {
    for (const value of Object.values(t[field] ?? {})) for (const raw of asArray(value)) addPattern(name, field, raw)
    if (t[field] !== undefined) fields.add(field)
  }
  if (t.certIssuer) fields.add('certIssuer')
  if (t.dom !== undefined) {
    // String/array selectors and exists/attributes/text checks work on static HTML; `properties` need a browser.
    const specs = typeof t.dom === 'object' && !Array.isArray(t.dom) ? Object.values(t.dom) : []
    const staticDom = specs.length === 0 || specs.some(s => s.exists !== undefined || s.attributes || s.text)
    fields.add(staticDom ? 'dom' : 'dom.properties')
  }
  const hasStatic = [...fields].some(f => STATIC_FIELDS.has(f) || f === 'dom')
  const hasRendered = [...fields].some(f => f === 'js' || f === 'xhr' || f === 'dom.properties')
  if (hasStatic) staticDetectable++
  else if (hasRendered) renderedOnly++
  else relationsOnly++
}

const categoryCounts = {}
for (const t of Object.values(techs)) for (const c of t.cats ?? []) categoryCounts[c] = (categoryCounts[c] ?? 0) + 1

console.log(JSON.stringify({
  technologies: Object.keys(techs).length,
  categories: Object.keys(categories).length,
  groups: Object.keys(groups).length,
  multiCategoryTechnologies: Object.values(techs).filter(t => (t.cats ?? []).length > 1).length,
  staticDetectable,
  renderedOnly,
  relationsOnly,
  patterns: Object.values(patternsByField).reduce((a, b) => a + b, 0),
  patternsByField,
  tags,
  regexThatFailToCompile: badRegex.length,
}, null, 2))

console.log('\nid\tcategory\tpriority\tgroups\ttechnologies')
for (const [id, c] of Object.entries(categories)) {
  console.log([id, c.name, c.priority, (c.groups ?? []).map(g => groups[g]?.name ?? g).join(', '), categoryCounts[id] ?? 0].join('\t'))
}
