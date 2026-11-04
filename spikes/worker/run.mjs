// Drives the deployed spike Worker and runs the same probes locally as a baseline.
// Usage:
//   SPIKE_TOKEN=… node spikes/worker/run.mjs <worker-url> <out-dir> [s2,s3,s4,s5]
//   node spikes/worker/run.mjs tail <tail-file>    summarise `wrangler tail --format json` output
// Writes one JSON file per spike and side into <out-dir>, and prints summary tables.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { s4 } from './src/dns.mjs'
import { echo, probe } from './src/probe.mjs'
import { ECHO_URL, S2_PAGES, S3_SITES, S4_DOMAINS } from './src/sites.mjs'

const [base, out, steps = 's2,s3,s4,s5'] = process.argv.slice(2)

if (base === 'tail') {
  summariseTail(out)
}
else {
  if (!base || !out || !process.env.SPIKE_TOKEN) throw new Error('usage: SPIKE_TOKEN=… node spikes/worker/run.mjs <worker-url> <out-dir> [s2,s3,s4,s5]')
  mkdirSync(out, { recursive: true })
  for (const step of steps.split(',')) await { s2, s3, s4: runS4, s5 }[step]()
}

async function worker(path) {
  const response = await fetch(new URL(path, base), { headers: { authorization: `Bearer ${process.env.SPIKE_TOKEN}` }, signal: AbortSignal.timeout(120_000) })
  const text = await response.text()
  try {
    return JSON.parse(text)
  }
  catch {
    return { error: `HTTP ${response.status}: ${text.slice(0, 300)}` }
  }
}

function save(name, data) {
  writeFileSync(join(out, `${name}.json`), JSON.stringify(data, null, 2))
}

async function inBatches(items, size, fn) {
  const results = []
  for (let i = 0; i < items.length; i += size) results.push(...await Promise.all(items.slice(i, i + size).map(fn)))
  return results
}

function median(values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
}

async function s2() {
  console.log('\n## S2: extract + match on workerd (Date.now across a timer)')
  const compile = await worker('/s2/compile')
  console.log(`compile: ${JSON.stringify(compile)}`)
  const rows = []
  for (const site of Object.keys(S2_PAGES)) {
    const one = await worker(`/s2?site=${site}&runs=1`)
    const five = await worker(`/s2?site=${site}&runs=5`)
    rows.push({ site, one, five })
    console.log([site, one.htmlKB, `extract ${one.extractMs} ms`, `match ${one.matchMs} ms (1 run)`, `${five.matchMs} ms (mean of 5)`, one.error ?? one.detected?.join(', ')].join('\t'))
  }
  save('s2-worker', { compile, rows })
}

async function s3() {
  console.log('\n## S3: what a target sees')
  const [remoteEcho, localEcho] = await Promise.all([worker('/s3/echo'), echo(ECHO_URL)])
  console.log('worker:', JSON.stringify(remoteEcho))
  console.log('local: ', JSON.stringify(localEcho))
  console.log('\n## S3: fetch reliability, worker vs local')
  // One site per invocation keeps each one inside the Free plan's 10 ms CPU limit.
  const remote = await inBatches(S3_SITES.map((_, i) => i), 3, async (i) => {
    const batch = await worker(`/s3?from=${i}&count=1`)
    return batch.results?.[0] ?? { url: S3_SITES[i], verdict: 'error', error: `spike worker: ${batch.error}` }
  })
  const local = await inBatches(S3_SITES, 6, url => probe(url, { maxBytes: 2 * 1024 * 1024 }))
  save('s3-worker', { echo: remoteEcho, results: remote })
  save('s3-local', { echo: localEcho, results: local })
  const describe = r => `${r.verdict} ${r.status ?? ''}${r.markers?.length ? ` [${r.markers.join(',')}]` : ''}${r.error ? ` (${r.error.slice(0, 60)})` : ''}`
  for (let i = 0; i < S3_SITES.length; i++) {
    const flag = remote[i].verdict === local[i].verdict ? ' ' : '≠'
    console.log(`${flag} ${S3_SITES[i].padEnd(34)} worker: ${describe(remote[i]).padEnd(44)} local: ${describe(local[i])}`)
  }
  for (const [name, results] of [['worker', remote], ['local', local]]) {
    const counts = {}
    for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1
    console.log(`${name}: ${JSON.stringify(counts)} · median ${median(results.filter(r => r.ms).map(r => r.ms))} ms`)
  }
}

async function runS4() {
  console.log('\n## S4: DoH and IP owner, worker vs local (wall ms)')
  const remote = []
  const local = []
  for (const domain of S4_DOMAINS) {
    remote.push(await worker(`/s4?domain=${domain}`))
    local.push(await s4(domain))
  }
  save('s4-worker', remote)
  save('s4-local', local)
  const row = r => r.error
    ? r.error
    : `cf ${r.cloudflare.totalMs} · google ${r.google.totalMs} · cymru ${r.owner?.cymru.ms ?? '-'} · ripe ${r.owner?.ripe.ms ?? '-'} · ${r.owner?.cymru.holder ?? r.owner?.ripe.holder ?? ''}`
  for (let i = 0; i < S4_DOMAINS.length; i++) console.log(`${S4_DOMAINS[i].padEnd(20)} worker: ${row(remote[i]).padEnd(64)} local: ${row(local[i])}`)
}

async function s5() {
  console.log('\n## S5: Browser Run')
  const before = await worker('/s5/status')
  console.log('status before:', JSON.stringify(before.limits ?? before))
  const rows = []
  let session = ''
  for (const site of Object.keys(S2_PAGES)) {
    const r = await worker(`/s5?site=${site}&match=1${session ? `&session=${session}` : ''}`)
    rows.push(r)
    if (r.sessionId) session = r.sessionId
    console.log(r.error
      ? `${site}\t${r.error.slice(0, 200)}`
      : [site, r.status, `reused ${r.reused}`, `open ${r.ms.open} · load ${r.ms.load} · collect ${r.ms.collect} ms`, `${r.requests.total} requests / ${r.requests.hosts} hosts`, `${r.cookies.length} cookies`, `${r.globals.count} globals`, `tls ${r.tls?.protocol} ${r.tls?.issuer}`, `js: ${r.detected?.js.join(', ')}`].join('\t'))
  }
  const browserEcho = await worker(`/s5/echo${session ? `?session=${session}` : ''}`)
  console.log('echo:', JSON.stringify(browserEcho))
  if (session) console.log('close:', JSON.stringify(await worker(`/s5/close?session=${session}`)))
  const after = await worker('/s5/status')
  console.log('history:', JSON.stringify(after.history?.slice(0, 5)))
  save('s5-worker', { before, rows, echo: browserEcho, after })
}

/** `wrangler tail --format json` prints pretty-printed JSON objects back to back. */
function summariseTail(file) {
  const text = readFileSync(file, 'utf8')
  const events = []
  let depth = 0
  let start = -1
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    }
    else if (c === '"') inString = true
    else if (c === '{' && depth++ === 0) start = i
    else if (c === '}' && --depth === 0) events.push(JSON.parse(text.slice(start, i + 1)))
  }
  console.log('outcome\tcpu ms\twall ms\turl')
  for (const e of events) {
    console.log([e.outcome, e.cpuTime ?? '?', e.wallTime ?? '?', e.event?.request?.url?.replace(/^https:\/\/[^/]+/, '') ?? ''].join('\t'))
  }
}
