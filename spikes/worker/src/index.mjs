// Spike Worker for the M0 spikes that need to run on Cloudflare: S2 (CPU on workerd), S3 (fetch
// reliability), S4 (DoH and IP-owner latency) and S5 (Browser Run). Throwaway: deploy, run
// spikes/worker/run.mjs, record the findings in docs/spikes.md, then `wrangler delete`.
//
// Every route needs `Authorization: Bearer <SPIKE_TOKEN>` and only fetches the fixed lists in
// sites.mjs, so the Worker can't be used as an open proxy.
import { compile, extract, match } from '../../lib/matching.mjs'
import technologies from '../.data/technologies.json'
import { browserEcho, browserStatus, closeSession, render } from './browser.mjs'
import { s4 } from './dns.mjs'
import { echo, fetchPage, probe } from './probe.mjs'
import { ECHO_URL, S2_PAGES, S3_SITES, S4_DOMAINS } from './sites.mjs'

// Compiled once per isolate, at startup: that's the startup budget, not a request's CPU time.
const compiled = compile(technologies)

// Inside Workers, Date.now() only moves across I/O. A zero-length timer is enough I/O to read
// the clock after synchronous work, so `tick(); t0; work(); tick(); t1` measures the work.
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2), { status, headers: { 'content-type': 'application/json' } })
const int = (value, fallback, min, max) => Math.min(max, Math.max(min, Number.parseInt(value ?? '', 10) || fallback))

const routes = {
  // S2: extract + match one page on workerd. Run with runs=1 and runs=N: the CPU-time difference is the match cost.
  async '/s2'(params) {
    const name = params.get('site')
    if (!S2_PAGES[name]) return json({ error: `site must be one of ${Object.keys(S2_PAGES).join(', ')}` }, 400)
    const runs = int(params.get('runs'), 1, 1, 20)
    const page = await fetchPage(S2_PAGES[name])
    await tick()
    const t0 = Date.now()
    const signals = extract(compiled, page)
    await tick()
    const t1 = Date.now()
    let found = new Set()
    for (let i = 0; i < runs; i++) found = match(compiled, page, signals, page.finalUrl)
    await tick()
    const t2 = Date.now()
    return json({ site: name, status: page.status, htmlKB: Math.round(page.html.length / 1024), runs, extractMs: t1 - t0, matchMs: (t2 - t1) / runs, detected: [...found].sort() })
  },

  // S2: the compile step on workerd (normally done once at startup).
  async '/s2/compile'() {
    await tick()
    const t0 = Date.now()
    const fresh = compile(technologies)
    await tick()
    return json({ technologies: fresh.technologies, compileMs: Date.now() - t0 })
  },

  // S3: probe a slice of the site list. Small slices keep each invocation inside the Free plan's limits.
  async '/s3'(params) {
    const from = int(params.get('from'), 0, 0, S3_SITES.length)
    const count = int(params.get('count'), 3, 1, 10)
    const sites = S3_SITES.slice(from, from + count)
    return json({ from, results: await Promise.all(sites.map(url => probe(url, { maxBytes: 2 * 1024 * 1024 }))) })
  },

  async '/s3/echo'(_, request) {
    return json({ colo: request.cf?.colo, country: request.cf?.country, echo: await echo(ECHO_URL) })
  },

  // S4: DoH profile from both resolvers plus the IP owner, for one name.
  async '/s4'(params) {
    const name = params.get('domain')
    if (!S4_DOMAINS.includes(name)) return json({ error: `domain must be one of ${S4_DOMAINS.join(', ')}` }, 400)
    return json(await s4(name))
  },

  // S5: render one S2 page in Browser Run. session=<id> reuses a browser; match=1 checks `js` rules
  // in the page, and dom=1 also runs the static matcher over the rendered DOM.
  async '/s5'(params, _, env) {
    const name = params.get('site')
    if (!S2_PAGES[name]) return json({ error: `site must be one of ${Object.keys(S2_PAGES).join(', ')}` }, 400)
    return json(await render(env, S2_PAGES[name], { sessionId: params.get('session'), compiled: params.get('match') === '1' ? compiled : undefined, dom: params.get('dom') === '1' }))
  },

  async '/s5/echo'(params, _, env) {
    return json(await browserEcho(env, ECHO_URL, params.get('session')))
  },

  async '/s5/status'(_, __, env) {
    return json(await browserStatus(env))
  },

  async '/s5/close'(params, _, env) {
    return json(await closeSession(env, params.get('session')))
  },
}

export default {
  async fetch(request, env) {
    if (!env.SPIKE_TOKEN || request.headers.get('authorization') !== `Bearer ${env.SPIKE_TOKEN}`) {
      return new Response('Not found', { status: 404 })
    }
    const url = new URL(request.url)
    const route = routes[url.pathname]
    if (!route) return json({ routes: Object.keys(routes) }, 404)
    try {
      return await route(url.searchParams, request, env)
    }
    catch (error) {
      return json({ error: String(error?.stack ?? error) }, 500)
    }
  },
}
