// S5: what a Browser Run session can see, how long it takes, and whether sessions can be reused.
import puppeteer from '@cloudflare/puppeteer'
import { extract, match } from '../../lib/matching.mjs'

// Note: the functions passed to page.evaluate() run in the page, not the Worker, so they can only
// use what's in their own body and their arguments.

const KEEP_ALIVE_MS = 120_000

/** Reconnects to `sessionId` when it's still alive, otherwise launches a new browser. */
async function open(env, sessionId) {
  if (sessionId) {
    try {
      return { browser: await puppeteer.connect(env.BROWSER, sessionId), reused: true }
    }
    catch {
      // The session ended (idle timeout or closed): fall through and launch a new one.
    }
  }
  return { browser: await puppeteer.launch(env.BROWSER, { keep_alive: KEEP_ALIVE_MS }), reused: false }
}

// Runs in the page. Returns window properties a blank frame doesn't have, i.e. ones the page added.
// page.evaluate() can only return primitives, so everything comes back as a JSON string.
const PAGE_GLOBALS = () => {
  try {
    const frame = document.createElement('iframe')
    frame.style.display = 'none'
    document.documentElement.appendChild(frame)
    const baseline = new Set(Object.getOwnPropertyNames(frame.contentWindow))
    frame.remove()
    return JSON.stringify(Object.getOwnPropertyNames(window).filter(k => !baseline.has(k)))
  }
  catch (error) {
    return JSON.stringify({ error: String(error) })
  }
}

// Runs in the page: which of these dotted property chains (`__NUXT__.config`) resolve to something.
// No named inner functions: Wrangler's bundler wraps those in a `__name()` helper the page doesn't have.
const PAGE_CHAINS = (chains) => {
  const present = []
  for (const chain of chains) {
    let value = window
    try {
      for (const key of chain.split('.')) value = value === null || value === undefined ? undefined : value[key]
    }
    catch {
      value = undefined
    }
    if (value !== undefined) present.push(chain)
  }
  return JSON.stringify(present)
}

const PAGE_PROBES = () => JSON.stringify({
  nextData: typeof window.__NEXT_DATA__ === 'object',
  nextRouter: typeof window.next === 'object',
  reactRoot: Boolean(document.querySelector('[data-reactroot], #__next, #root')),
  reactDevtoolsHook: typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ === 'object',
  nuxt: typeof window.__NUXT__ === 'object' || typeof window.useNuxtApp === 'function',
  vue: typeof window.__VUE__ !== 'undefined',
  domNodes: document.getElementsByTagName('*').length,
})

/** Loads one URL in a fresh browser context and reports what the browser saw. */
export async function render(env, url, { sessionId, compiled, dom = false } = {}) {
  const t0 = Date.now()
  const { browser, reused } = await open(env, sessionId)
  const tOpen = Date.now()
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  const responses = []
  const failed = []
  page.on('response', r => responses.push({ url: r.url(), status: r.status(), type: r.request().resourceType() }))
  page.on('requestfailed', r => failed.push({ url: r.url(), error: r.failure()?.errorText }))

  let response = null
  let gotoError
  try {
    response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 20_000 })
  }
  catch (error) {
    gotoError = String(error?.message ?? error)
  }
  const tLoad = Date.now()

  const security = response?.securityDetails()
  const tls = security && {
    protocol: security.protocol(),
    issuer: security.issuer(),
    subject: security.subjectName(),
    validFrom: new Date(security.validFrom() * 1000).toISOString(),
    validTo: new Date(security.validTo() * 1000).toISOString(),
    sans: security.subjectAlternativeNames().length,
  }
  const cdp = await page.createCDPSession()
  const { cookies } = await cdp.send('Network.getAllCookies')
  const globals = JSON.parse(await page.evaluate(PAGE_GLOBALS))
  const probes = JSON.parse(await page.evaluate(PAGE_PROBES))
  const html = await page.content()
  const userAgent = await browser.userAgent()
  const tCollect = Date.now()

  let detected
  if (compiled) {
    // The static matcher over the rendered DOM, plus `js` rules checked as full property chains
    // in the page. Matching on the first segment alone (`__NEXT_DATA__`) would also "find" every
    // Next.js-based CMS whose rule is `__NEXT_DATA__.props.…`.
    const headers = new Map(Object.entries(response?.headers() ?? {}).map(([k, v]) => [k, v.split('\n')]))
    // The DOM match costs tens of ms of CPU, more than the Free plan allows: opt in with dom=1.
    const domFound = dom ? match(compiled, { html, headers }, extract(compiled, { html, headers }), page.url()) : null
    const candidates = (Array.isArray(globals) ? globals : []).flatMap(name => compiled.jsChains.get(name) ?? [])
    const present = new Set(JSON.parse(await page.evaluate(PAGE_CHAINS, [...new Set(candidates.map(c => c.chain))])))
    const js = new Set(candidates.filter(c => present.has(c.chain)).map(c => c.tech))
    detected = {
      ...(domFound ? { dom: [...domFound].sort() } : {}),
      js: [...js].sort(),
      firstSegmentOnly: new Set(candidates.map(c => c.tech)).size,
    }
  }

  await context.close()
  const id = browser.sessionId()
  browser.disconnect() // keep the browser alive for the next request (session reuse)

  const hosts = {}
  const types = {}
  for (const r of responses) {
    const host = URL.canParse(r.url) ? new URL(r.url).host : r.url.slice(0, 40)
    hosts[host] = (hosts[host] ?? 0) + 1
    types[r.type] = (types[r.type] ?? 0) + 1
  }
  return {
    url,
    finalUrl: page.url(),
    status: response?.status() ?? null,
    gotoError,
    sessionId: id,
    reused,
    ms: { open: tOpen - t0, load: tLoad - tOpen, collect: tCollect - tLoad, total: Date.now() - t0 },
    userAgent,
    tls,
    requests: { total: responses.length, failed: failed.length, types, hosts: Object.keys(hosts).length, topHosts: Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 8) },
    cookies: cookies.map(c => ({ name: c.name, domain: c.domain, httpOnly: c.httpOnly, thirdParty: !page.url().includes(c.domain.replace(/^\./, '')) })),
    globals: Array.isArray(globals) ? { count: globals.length, names: globals.slice(0, 80) } : globals,
    probes,
    renderedHtmlBytes: html.length,
    // Does the browser see the origin's own headers, or Cloudflare's like fetch() does?
    mainHeaders: Object.fromEntries(['server', 'x-powered-by', 'alt-svc', 'cf-ray', 'cf-cache-status', 'via'].map(k => [k, response?.headers()[k]]).filter(([, v]) => v)),
    ...(detected ? { detected } : {}),
  }
}

/** What a target sees from Browser Run: request headers echoed back, as rendered text. */
export async function browserEcho(env, echoUrl, sessionId) {
  const { browser, reused } = await open(env, sessionId)
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.goto(echoUrl, { waitUntil: 'load', timeout: 15_000 })
  const text = await page.evaluate(() => document.body.innerText)
  await context.close()
  const id = browser.sessionId()
  browser.disconnect()
  let body
  try {
    body = JSON.parse(text)
  }
  catch {
    body = text.slice(0, 2_000)
  }
  return { sessionId: id, reused, body }
}

/** Account-level view: limits, open sessions, and recent session history (browser time). */
export async function browserStatus(env) {
  const [limits, sessions, history] = await Promise.all([
    puppeteer.limits(env.BROWSER),
    puppeteer.sessions(env.BROWSER),
    puppeteer.history(env.BROWSER),
  ])
  return { limits, sessions, history }
}

/** Closes a session for good (the runner calls this at the end). */
export async function closeSession(env, sessionId) {
  const browser = await puppeteer.connect(env.BROWSER, sessionId)
  await browser.close()
  return { closed: sessionId }
}
