// S3 and S2 fetching: one honest GET per site, redirects followed by hand.
// Web-standard APIs only: the local runner uses this same module under Node for the baseline.

export const USER_AGENT = 'Stacter/0.0 (spike; +https://github.com/nickczj/stacter)'
const REQUEST_HEADERS = {
  'user-agent': USER_AGENT,
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en',
}
const KEPT_HEADERS = [
  'server', 'x-powered-by', 'alt-svc', 'content-type', 'via', 'x-cache', 'cf-ray', 'cf-cache-status', 'cf-mitigated', 'x-vercel-id', 'x-vercel-mitigated',
  'x-datadome', 'x-amzn-waf-action', 'x-iinfo', 'x-kpsdk-ct', 'akamai-grn', 'x-akamai-transformed', 'retry-after',
]

/** Reads at most `maxBytes` of a body, and decodes at most `decodeBytes` of it. */
async function readCapped(response, maxBytes, decodeBytes = Infinity) {
  if (!response.body) return { bytes: 0, truncated: false, text: '' }
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  let truncated = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > maxBytes) {
      truncated = true
      await reader.cancel()
      break
    }
    chunks.push(value)
  }
  const all = new Uint8Array(Math.min(decodeBytes, chunks.reduce((n, c) => n + c.byteLength, 0)))
  let offset = 0
  for (const c of chunks) {
    if (offset >= all.length) break
    const part = c.subarray(0, all.length - offset)
    all.set(part, offset)
    offset += part.byteLength
  }
  return { bytes, truncated, text: new TextDecoder().decode(all) }
}

function headerMap(headers) {
  const map = new Map()
  for (const [key, value] of headers) if (key !== 'set-cookie') map.set(key, [value])
  const cookies = headers.getSetCookie?.() ?? []
  if (cookies.length > 0) map.set('set-cookie', cookies)
  return map
}

/** GET with redirects followed by hand (≤ maxHops), every hop recorded. */
export async function fetchPage(url, { maxHops = 5, timeoutMs = 10_000, maxBytes = 5 * 1024 * 1024, decodeBytes } = {}) {
  const started = Date.now()
  const hops = []
  let current = url
  for (let hop = 0; ; hop++) {
    const t = Date.now()
    const response = await fetch(current, { redirect: 'manual', headers: REQUEST_HEADERS, signal: AbortSignal.timeout(timeoutMs) })
    const location = response.headers.get('location')
    hops.push({ url: current, status: response.status, ms: Date.now() - t, ...(location ? { location } : {}) })
    if (response.status >= 300 && response.status < 400 && location && hop < maxHops) {
      await response.body?.cancel()
      current = new URL(location, current).href
      continue
    }
    const body = await readCapped(response, maxBytes, decodeBytes)
    return {
      url,
      finalUrl: current,
      status: response.status,
      hops,
      ms: Date.now() - started,
      headers: headerMap(response.headers),
      html: body.text,
      bytes: body.bytes,
      truncated: body.truncated,
    }
  }
}

/** Fingerprints of bot walls and challenge pages: [id, test(page, lowerHtml)]. */
const MARKERS = [
  ['cloudflare-challenge', (p, h) => p.headers.get('cf-mitigated')?.[0] === 'challenge' || h.includes('/cdn-cgi/challenge-platform/') || h.includes('<title>just a moment...</title>')],
  ['cloudflare-block', (_, h) => h.includes('attention required! | cloudflare') || h.includes('sorry, you have been blocked')],
  ['akamai-block', (p, h) => h.includes('errors.edgesuite.net') || (p.status === 403 && /akamaighost/i.test(p.headers.get('server')?.[0] ?? ''))],
  ['datadome', (p, h) => p.headers.has('x-datadome') || h.includes('captcha-delivery.com')],
  ['perimeterx', (_, h) => h.includes('px-captcha') || h.includes('_pxappid') || h.includes('perimeterx')],
  ['imperva', (_, h) => h.includes('_incapsula_resource') || h.includes('incapsula incident id')],
  ['aws-waf', (p, h) => p.headers.has('x-amzn-waf-action') || h.includes('awswafintegration') || h.includes('aws-waf-token')],
  ['vercel-checkpoint', (p, h) => p.headers.has('x-vercel-mitigated') || h.includes('vercel security checkpoint')],
  ['kasada', p => p.headers.has('x-kpsdk-ct')],
]

/** S3: fetch one site and classify the outcome. Never retries, never changes identity (D-012). */
export async function probe(url, options) {
  let page
  try {
    page = await fetchPage(url, { decodeBytes: 512 * 1024, ...options })
  }
  catch (error) {
    return { url, verdict: 'error', error: String(error?.message ?? error) }
  }
  const lower = page.html.toLowerCase()
  const markers = MARKERS.filter(([, test]) => test(page, lower)).map(([id]) => id)
  const title = /<title[^>]*>([^<]{0,200})/i.exec(page.html)?.[1]?.trim()
  const { status } = page
  const verdict = markers.length > 0 && (status >= 400 || page.bytes < 64 * 1024)
    ? 'challenged'
    : status >= 200 && status < 300
      ? 'ok'
      : [401, 403, 429, 451].includes(status) ? 'blocked' : 'other'
  return {
    url,
    verdict,
    status,
    finalUrl: page.finalUrl,
    hops: page.hops.length,
    ms: page.ms,
    bytes: page.bytes,
    truncated: page.truncated,
    title,
    markers,
    headers: Object.fromEntries(KEPT_HEADERS.filter(k => page.headers.has(k)).map(k => [k, page.headers.get(k)[0]])),
    cookies: (page.headers.get('set-cookie') ?? []).map(c => c.split('=')[0].trim()),
  }
}

/** What a target sees: the request headers as echoed back by an echo service. */
export async function echo(url) {
  const response = await fetch(url, { headers: REQUEST_HEADERS })
  return { status: response.status, body: await response.json() }
}
