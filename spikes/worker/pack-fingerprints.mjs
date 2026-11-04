// Packs webappanalyzer's technologies into .data/technologies.json for the spike Worker to import,
// keeping only the fields the S2 matcher reads.
// Usage: node spikes/worker/pack-fingerprints.mjs <webappanalyzer-checkout>
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = process.argv[2]
if (!repo) throw new Error('usage: node spikes/worker/pack-fingerprints.mjs <webappanalyzer-checkout>')

const FIELDS = ['headers', 'cookies', 'meta', 'scriptSrc', 'html', 'text', 'scripts', 'url', 'js']
const packed = {}
for (const file of readdirSync(join(repo, 'src/technologies')).filter(f => f.endsWith('.json'))) {
  for (const [name, tech] of Object.entries(JSON.parse(readFileSync(join(repo, 'src/technologies', file), 'utf8')))) {
    packed[name] = Object.fromEntries(FIELDS.filter(f => tech[f] !== undefined).map(f => [f, tech[f]]))
  }
}
const out = join(dirname(fileURLToPath(import.meta.url)), '.data/technologies.json')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(packed))
console.log(`${Object.keys(packed).length} technologies → ${out}`)
