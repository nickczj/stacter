// Spike S2: CPU cost of matching every fingerprint pattern against real pages.
// Usage: node spikes/s2-matching-bench.mjs <webappanalyzer-checkout> <pages-dir> [naive|includes|aho]
//   <pages-dir> holds <name>.html and <name>.headers pairs (from `curl -D <name>.headers -o <name>.html`).
// Modes:
//   naive     every regex runs over its whole input; JS globals by naive substring search
//   includes  skip a regex unless its required literal appears (one `includes` per pattern)
//   aho       same prefilter, but all literals are found in one Aho–Corasick pass per input
// The matcher itself is in lib/matching.mjs, shared with the spike Worker.
// Throwaway code: M1 rebuilds this properly inside @stacter/engine.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { MODES, compile, extract, match } from './lib/matching.mjs'

const [repo, pagesDir, mode = 'aho'] = process.argv.slice(2)
if (!repo || !pagesDir || !MODES.includes(mode)) {
  throw new Error('usage: node spikes/s2-matching-bench.mjs <webappanalyzer-checkout> <pages-dir> [naive|includes|aho]')
}
const now = () => performance.now()

const techs = {}
for (const file of readdirSync(join(repo, 'src/technologies')).filter(f => f.endsWith('.json'))) {
  Object.assign(techs, JSON.parse(readFileSync(join(repo, 'src/technologies', file), 'utf8')))
}
const tCompile = now()
const compiled = compile(techs, mode)
const compileMs = now() - tCompile

function readPage(name) {
  const html = readFileSync(join(pagesDir, `${name}.html`), 'utf8')
  const blocks = readFileSync(join(pagesDir, `${name}.headers`), 'utf8').split(/\r?\n(?=HTTP\/)/)
  const headers = new Map()
  for (const line of blocks.at(-1).split(/\r?\n/).slice(1)) {
    const i = line.indexOf(':')
    if (i <= 0) continue
    const key = line.slice(0, i).trim().toLowerCase()
    headers.set(key, [...(headers.get(key) ?? []), line.slice(i + 1).trim()])
  }
  return { name, html, headers }
}

const pages = readdirSync(pagesDir).filter(f => f.endsWith('.html')).map(f => readPage(f.slice(0, -5))).filter(p => p.html.length > 1000)
const runtime = process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.version}`
console.log(`${runtime} · mode=${mode} · ${compiled.technologies} technologies · setup ${compileMs.toFixed(0)} ms`)
console.log('page\thtml KB\textract ms\tmatch ms (median)\tmatch ms (max)\tdetected')
for (const page of pages) {
  const url = `https://${page.name}.example/`
  const t0 = now()
  const signals = extract(compiled, page)
  const extractMs = now() - t0
  for (let i = 0; i < 3; i++) match(compiled, page, signals, url)
  const times = []
  let found
  for (let i = 0; i < 15; i++) {
    const t = now()
    found = match(compiled, page, signals, url)
    times.push(now() - t)
  }
  times.sort((a, b) => a - b)
  console.log([page.name, Math.round(page.html.length / 1024), extractMs.toFixed(1), times[7].toFixed(1), times[14].toFixed(1), [...found].sort().join(', ')].join('\t'))
}
