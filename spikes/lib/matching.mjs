// Spike S2's matcher, shared by the local bench (s2-matching-bench.mjs) and the
// spike Worker (worker/), so both measure the same code. Web-standard APIs only.
// Throwaway code: M1 rebuilds this properly inside @stacter/engine.

export const MODES = ['naive', 'includes', 'aho']
const SCANNED = ['scriptSrc', 'html', 'text', 'scripts']
const asArray = v => (v === undefined ? [] : Array.isArray(v) ? v : [v])

/**
 * Longest literal run every match must contain (lower-cased), or null when there's no safe one:
 * a top-level alternation, or nothing but classes and groups.
 */
export function requiredLiteral(source) {
  let depth = 0
  let inClass = false
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '\\') i++
    else if (inClass) inClass = c !== ']'
    else if (c === '[') inClass = true
    else if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === '|' && depth === 0) return null
  }
  let best = ''
  let current = ''
  const flush = () => {
    if (current.length > best.length) best = current
    current = ''
  }
  depth = 0
  inClass = false
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (inClass) {
      if (c === '\\') i++
      else if (c === ']') inClass = false
    }
    else if (c === '[') {
      flush()
      inClass = true
    }
    else if (c === '(' || c === ')') {
      flush()
      depth += c === '(' ? 1 : -1
    }
    else if (depth > 0) {
      if (c === '\\') i++
    }
    else if (c === '\\') {
      const next = source[++i]
      if (next !== undefined && /[.\\/\-?*+()[\]{}|^$:;'"<>=!&#%@,~`_ ]/.test(next)) current += next
      else flush() // \d, \w, \s, \b … aren't literal characters
    }
    else if ('.^$'.includes(c)) {
      flush()
    }
    else if ('*?+{'.includes(c)) {
      current = current.slice(0, -1) // the quantifier makes the previous character optional or repeated
      flush()
      if (c === '{') while (i < source.length && source[i] !== '}') i++
    }
    else {
      current += c
    }
  }
  flush()
  return best.length >= 3 ? best.toLowerCase() : null
}

/** Finds which of many words occur in a text in a single pass. */
export class AhoCorasick {
  constructor(words) {
    this.next = [new Map()]
    this.fail = [0]
    this.out = [[]]
    words.forEach((word, id) => {
      let state = 0
      for (let i = 0; i < word.length; i++) {
        const code = word.charCodeAt(i)
        let to = this.next[state].get(code)
        if (to === undefined) {
          to = this.next.length
          this.next.push(new Map())
          this.fail.push(0)
          this.out.push([])
          this.next[state].set(code, to)
        }
        state = to
      }
      this.out[state].push(id)
    })
    const queue = [...this.next[0].values()]
    while (queue.length > 0) {
      const state = queue.shift()
      for (const [code, to] of this.next[state]) {
        queue.push(to)
        let f = this.fail[state]
        while (f && !this.next[f].has(code)) f = this.fail[f]
        const target = this.next[f].get(code)
        this.fail[to] = target !== undefined && target !== to ? target : 0
        this.out[to] = this.out[to].concat(this.out[this.fail[to]])
      }
    }
  }

  scan(text) {
    const hits = new Set()
    let state = 0
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      while (state && !this.next[state].has(code)) state = this.fail[state]
      state = this.next[state].get(code) ?? 0
      for (const id of this.out[state]) hits.add(id)
    }
    return hits
  }
}

/** Compiles technologies (webappanalyzer's `src/technologies/*.json`, merged) into rules. */
export function compile(techs, mode = 'aho') {
  if (!MODES.includes(mode)) throw new Error(`unknown mode: ${mode}`)
  const rules = { headers: [], cookies: [], meta: [], scriptSrc: [], html: [], text: [], scripts: [], url: [] }
  const jsKeys = new Map() // first segment of each `js` property chain → technologies
  const jsChains = new Map() // first segment → full property chains, for rendered scans that can check them
  for (const [tech, t] of Object.entries(techs)) {
    for (const field of ['headers', 'cookies', 'meta']) {
      for (const [key, value] of Object.entries(t[field] ?? {})) {
        for (const raw of asArray(value)) {
          const source = String(raw).split('\\;')[0]
          rules[field].push({ tech, key: key.toLowerCase(), re: new RegExp(source, 'i') })
        }
      }
    }
    for (const field of [...SCANNED, 'url']) {
      for (const raw of asArray(t[field])) {
        const source = String(raw).split('\\;')[0]
        rules[field].push({ tech, source, re: new RegExp(source, 'i'), literal: mode === 'naive' ? null : requiredLiteral(source) })
      }
    }
    for (const key of Object.keys(t.js ?? {})) {
      const first = key.split('.')[0]
      jsKeys.set(first, [...(jsKeys.get(first) ?? []), tech])
      jsChains.set(first, [...(jsChains.get(first) ?? []), { chain: key, tech }])
    }
  }
  const automata = {}
  if (mode === 'aho') {
    for (const field of SCANNED) {
      const literals = [...new Set(rules[field].map(r => r.literal).filter(Boolean))]
      const ids = new Map(literals.map((literal, id) => [literal, id]))
      for (const rule of rules[field]) rule.literalId = rule.literal ? ids.get(rule.literal) : undefined
      automata[field] = new AhoCorasick(literals)
    }
  }
  return { mode, rules, jsKeys, jsChains, automata, technologies: Object.keys(techs).length }
}

/**
 * Pulls the signals out of a page (rough regex extraction; the engine will use htmlparser2).
 * `page.headers` is a Map of lower-cased header name → list of values.
 */
export function extract(compiled, { html, headers }) {
  const scriptSrcs = []
  const inline = []
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = /\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(m[1])?.[1]
    if (src) scriptSrcs.push(src)
    else if (m[2]) inline.push(m[2])
  }
  const meta = new Map()
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const name = /\b(?:name|property)\s*=\s*["']([^"']+)/i.exec(m[0])?.[1]?.toLowerCase()
    const content = /\bcontent\s*=\s*["']([^"']*)/i.exec(m[0])?.[1]
    if (name && content !== undefined) meta.set(name, [...(meta.get(name) ?? []), content])
  }
  const cookies = new Map()
  for (const header of headers.get('set-cookie') ?? []) {
    const pair = header.split(';')[0]
    const i = pair.indexOf('=')
    cookies.set(pair.slice(0, i).trim().toLowerCase(), pair.slice(i + 1))
  }
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
  const scripts = inline.join('\n')
  const assigned = new Set()
  if (compiled.mode !== 'naive') {
    // Strict heuristic for `js` rules: explicit global assignments only, e.g. `window.__NUXT__=`.
    for (const m of scripts.matchAll(/\b(?:window|self|globalThis)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) assigned.add(m[1])
  }
  const inputs = { scriptSrc: scriptSrcs.join('\n'), html, text, scripts }
  const lower = Object.fromEntries(SCANNED.map(field => [field, inputs[field].toLowerCase()]))
  return { scriptSrcs, scripts, text, meta, cookies, assigned, lower }
}

/** Runs every rule against a page's signals and returns the names of the technologies found. */
export function match(compiled, page, signals, url) {
  const { mode, rules, jsKeys, automata } = compiled
  const found = new Set()
  const hits = {}
  if (mode === 'aho') for (const field of SCANNED) hits[field] = automata[field].scan(signals.lower[field])
  const candidate = (field, rule) => {
    if (mode === 'naive' || !rule.literal) return true
    return mode === 'aho' ? hits[field].has(rule.literalId) : signals.lower[field].includes(rule.literal)
  }
  for (const r of rules.headers) for (const v of page.headers.get(r.key) ?? []) if (r.re.test(v)) found.add(r.tech)
  for (const r of rules.meta) for (const v of signals.meta.get(r.key) ?? []) if (r.re.test(v)) found.add(r.tech)
  for (const r of rules.cookies) {
    const prefix = r.key.endsWith('*') ? r.key.slice(0, -1) : null
    for (const [name, value] of signals.cookies) {
      if ((prefix === null ? name === r.key : name.startsWith(prefix)) && r.re.test(value)) found.add(r.tech)
    }
  }
  for (const r of rules.scriptSrc) {
    if (candidate('scriptSrc', r) && signals.scriptSrcs.some(src => r.re.test(src))) found.add(r.tech)
  }
  for (const r of rules.html) if (candidate('html', r) && r.re.test(page.html)) found.add(r.tech)
  for (const r of rules.text) if (candidate('text', r) && r.re.test(signals.text)) found.add(r.tech)
  for (const r of rules.scripts) if (candidate('scripts', r) && r.re.test(signals.scripts)) found.add(r.tech)
  for (const r of rules.url) if (r.re.test(url)) found.add(r.tech)
  if (mode === 'naive') {
    for (const [key, list] of jsKeys) if (key.length > 3 && signals.scripts.includes(key)) for (const t of list) found.add(t)
  }
  else {
    for (const key of signals.assigned) for (const t of jsKeys.get(key) ?? []) found.add(t)
  }
  return found
}
