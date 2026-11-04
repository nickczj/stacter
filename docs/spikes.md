# Spike findings

What the M0 spikes found. [PLAN.md §9](PLAN.md#9-spikes) keeps a one-line summary of each, and the scripts live in [`spikes/`](../spikes).

## S1 — Fingerprint data

**Status:** done, 2026-11-03. Data: `enthec/webappanalyzer` at `c708f0b` (2026-11-03). Script: [`spikes/s1-fingerprints.mjs`](../spikes/s1-fingerprints.mjs).

**License.** `LICENSE` is the verbatim GNU GPL v3 text, and nothing says "or any later version", so the data is GPL-3.0 (version 3 only). Stacter uses GPL-3.0-only to match (D-010).

**Size and shape.**
- 7,695 technologies, 109 categories, 17 groups. 908 technologies (12%) have more than one category.
- 13,958 patterns in list and keyed fields, plus 225 inside `dom` rules. Every pattern compiles as a JavaScript `RegExp` with the `i` flag.
- Patterns by field: `js` 5,710 · `scriptSrc` 4,174 · `headers` 879 · `meta` 856 · `scripts` 827 · `cookies` 513 · `html` 461 · `dns` 186 · `xhr` 150 · `url` 91 · `text` 66 · `css` 41 · `probe` 3 · `robots` 1.
- Pattern tags: `\;version:` 1,317 times, `\;confidence:` 202 times.
- `schema.json` confirms every field the plan assumed. `certIssuer` exists but only 6 technologies use it, so the TLS issuer is worth little for detection; it stays in the Request anatomy panel. `html` is marked deprecated in favour of `dom` and `text`.

**What a plain fetch can see.** 6,745 technologies (88%) have at least one rule that works on static HTML, headers, cookies or DNS. 911 (12%) only have rules that need a browser (`js`, `xhr`, DOM `properties`), and 39 are only reachable through `implies`.

**DNS is thin.** Only 186 DNS patterns across 145 technologies (TXT 77, SOA 51, NS 33, CNAME 5, MX 5). The DNS layer, email providers and hosting CNAME targets need Stacter's own rules, as planned.

**The plan's worked example holds.**
- Nuxt: `html` `<script [^>]*>window\.__NUXT__`, `js` `__NUXT__` / `$nuxt` / `useNuxtApp`, `scriptSrc` `/_nuxt/`, `dom` `div[id^='__nuxt']`; implies Vue.js.
- Cloudflare: headers `cf-ray`, `cf-cache-status`, `Server: ^cloudflare$`; DNS NS/SOA `.cloudflare.com`.

**Gaps and stale rules** (candidates for Stacter rules and upstream pull requests):
- Next.js has no `/_next/` asset rule and no static `__NEXT_DATA__` rule (only `js` and `x-powered-by`), so a static scan of react.dev, a Next.js site, finds neither Next.js nor React (S2).
- Nuxt sends `x-powered-by: Nuxt` by default (our own build does), and there's no header rule for it.
- Cloudflare's cookie rule is `__cfduid`, a cookie Cloudflare retired in 2021; current cookies such as `__cf_bm` aren't covered.
- Deno has no rules of its own: it's only implied by Deno Deploy's `server: deno/…` header. Bun isn't in the data at all.

**Layers.** Categories have a `priority`, but it's a display weight, not a layer: picking each technology's highest-priority category would put Nginx (Web servers, p8; Reverse proxies, p7) under Edge & CDN. One technology can also span layers through its evidence: Cloudflare's NS records belong in the DNS layer, its `cf-ray` header in Edge & CDN. Hence D-017: category defaults, a precedence for multi-category technologies (framework > server > hosting > edge > frontend > services), placement by evidence source, and per-technology overrides (for example, Sentry is filed under Issue trackers, and Security mixes WAFs with CAPTCHAs).

Draft category → layer defaults for M1 to check against real scans:

| Layer | Categories |
|---|---|
| Edge & CDN | CDN, Reverse proxies, Load balancers, SSL/TLS certificate authorities |
| Hosting & platform | PaaS, IaaS, Hosting, Hosting panels, Containers, Domain parking |
| Server & runtime | Web servers, Programming languages, Web server extensions, Databases, Database managers, Caching, Operating systems, Network devices, Control systems, Network storage, Media servers, Remote access |
| Framework & CMS | CMS, Ecommerce, Ecommerce frontends, Blogs, Wikis, Message boards, Documentation, LMS, DMS, Page builders, Static site generator, Web frameworks, Issue trackers, Photo galleries, Webmail, Feed readers, Search engines, CI, WordPress themes, Shopify themes, Drupal themes, WordPress plugins, Shopify apps |
| Frontend & UI | JavaScript frameworks, JavaScript libraries, UI frameworks, Font scripts, JavaScript graphics, Mobile frameworks, Rich text editors, Video players, Accessibility |
| Third-party services | Analytics, Tag managers, Advertising, Marketing automation, Live chat, CRM, Payment processors, Buy now pay later, Cookie compliance, Security, Authentication, A/B Testing, RUM, Surveys, Widgets, Comment systems, Maps, Email, SEO, Personalisation, Retargeting, Segmentation, Customer data platform, Reviews, Affiliate programs, Referral marketing, Loyalty & rewards, Shipping carriers, Fulfilment, Returns, Cart abandonment, Cross border ecommerce, Appointment scheduling, Reservations & delivery, Ticket booking, Form builders, Translation, Geolocation, Browser fingerprinting, Feature management, User onboarding, Recruitment & staffing, Livestreaming, Augmented reality, Digital asset management, Content curation, Fundraising & donations, Performance, Accounting, Cryptominers, Artificial Intelligence |
| Other | Miscellaneous, Development |
| Domain & DNS | No category maps here by default; it's filled by DNS evidence and Stacter's own rules |

**Logos.** The repo ships brand icons (`src/images`). The GPL covers the files, not the trademarks; whether to show them is an open question (PLAN.md §11).

## S2 — Matching CPU budget

**Status:** done locally on 2026-11-03 and on Workers on 2026-11-04 ([below](#on-workers)). Scripts: [`spikes/s2-matching-bench.mjs`](../spikes/s2-matching-bench.mjs) and the [spike Worker](../spikes/worker), which share the matcher in [`spikes/lib/matching.mjs`](../spikes/lib/matching.mjs).

**Setup.** Seven real homepages fetched on 2026-11-03, from 163 KB to 1.3 MB of HTML: wordpress.org/news, react.dev, bbc.com/news, nuxt.com, vercel.com, shopify.com and cloudflare.com (github.com rejected the request with HTTP 400). All headers, cookies, meta, `scriptSrc`, `html`, `text`, `scripts`, `url` and `js` rules ran against each page; DOM rules weren't measured. Signals were extracted with rough regexes (M1 will use `htmlparser2`). Node 22.23 and Bun 1.4.4 in the dev container; median of 15 runs after 3 warm-ups.

| Approach | Per page (median) | Setup | Detections |
|---|---|---|---|
| Naive: every regex over its whole input; `js` keys by substring search | 52–809 ms | ~58 ms | Dozens of false positives per page from the substring search |
| Required-literal prefilter (one `includes` per pattern) + explicit global assignments for `js` | 29–273 ms | ~57 ms | Plausible (below) |
| Same prefilter, but all literals found in one Aho–Corasick pass per input | **12–67 ms** | ~135–145 ms | Identical to the row above |

Per page with Aho–Corasick, in Node (Bun is within about 10%):

| Page | HTML | Match (median) |
|---|---|---|
| wordpress.org/news | 163 KB | 11.8 ms |
| react.dev | 266 KB | 16.8 ms |
| bbc.com/news | 437 KB | 32.0 ms |
| nuxt.com | 521 KB | 38.4 ms |
| vercel.com | 576 KB | 42.0 ms |
| shopify.com | 660 KB | 43.8 ms |
| cloudflare.com | 1,303 KB | 67.1 ms |

What it detected:
- **nuxt.com:** Nuxt.js, Vue.js, Vercel, Pinia, Supabase, Checkly, HSTS
- **cloudflare.com:** Astro, Cloudflare, Cloudflare Bot Management, Google Analytics, OneTrust, LinkedIn Insight Tag
- **vercel.com:** Next.js, React, Vercel, Amazon S3
- **wordpress.org/news:** WordPress, Nginx, Jetpack, Google Tag Manager
- **react.dev:** only Google Analytics, Google Tag Manager, Vercel and HSTS. React and Next.js are invisible to a static scan of this site (see the S1 gaps).

**Conclusions.**
- The 50 ms target is reachable for typical pages: extract each regex's required literal (5,549 of the 5,619 list-field patterns have one), find all literals in one pass, and run only the candidate regexes (D-018). Pages over about 1 MB land near 65 ms, which is acceptable.
- Setup moves to build time: precompute the literal table and the automaton in the compiled fingerprint artifact, and compile each RegExp the first time it's a candidate. Only 78–2,438 regexes run per page.
- Matching `js` keys by substring is both slow (up to 611 ms) and wrong. M1 only trusts explicit global assignments: `window.X =`, `self.X =`, `globalThis.X =`.
- A few patterns backtrack badly on large documents, such as Liveinternet's `<script [^>]*>[\s\S]*//counter\.yadro\.ru/hit` (about 52–65 ms summed over one pass of the seven pages). The prefilter skips them unless their literal is present, and M1's regex lint should flag the `[\s\S]*` + literal shape anyway.
- The spike's automaton is a simple Map-based one; a typed-array version should cut the 5–22 ms scan time further.
- **Not measured yet:** `htmlparser2` extraction (M1).

### On Workers

The same matcher ran in a throwaway Worker on the Free plan, which Cloudflare placed in Tokyo (NRT). Each request fetched one page, extracted it and matched it once (`runs=1`) or five times (`runs=5`). CPU times come from `wrangler tail` (`cpuTime`), so `(runs=5 − runs=1) / 4` is the CPU time of one warm match. For comparison, the same pages were matched by Node 24 on the owner's Mac.

| Page | HTML | Workers: fetch + extract + 1 match | Workers: warm match | Node, owner's Mac | Node, dev container |
|---|---|---|---|---|---|
| wordpress.org/news | 163 KB | 105 ms | ~20 ms | 8.0 ms | 11.8 ms |
| react.dev | 266 KB | 45 ms | ~32 ms | 11.5 ms | 16.8 ms |
| bbc.com/news | 474 KB | 94 ms | ~77 ms | 24.0 ms | 32.0 ms |
| nuxt.com | 521 KB | 106 ms | ~72 ms | 26.8 ms | 38.4 ms |
| vercel.com | 578 KB | 148 ms | killed (Free plan) | 28.1 ms | 42.0 ms |
| shopify.com | 660 KB | 114 ms | killed | 30.9 ms | 43.8 ms |
| cloudflare.com | 1,303 KB | 162 ms | not run | 43.3 ms | 67.1 ms |

- **The 50 ms p95 budget isn't met on Workers yet.** A warm match takes about 2–3× the CPU it takes in Node on a Mac, and about 2× the dev container: ~20 ms for a 163 KB page and ~75 ms for 500 KB. D-018 is still the right design, but M1 has to win back roughly half: the typed-array automaton, fewer whole-document `html` regexes, and benchmarks against Workers CPU time rather than Node.
- **Setup is expensive on Workers too.** Compiling every rule took 123 ms of CPU, against 47–52 ms in Node. When the compile ran at module scope, Wrangler reported a startup time of 176–282 ms (parsing the 616 KB of packed rules, then compiling). Precomputing at build time (D-018) matters.
- **The Free plan is ruled out, confirming D-013.** The first few requests ran 45–520 ms of CPU, then Workers began enforcing the 10 ms limit (`exceededCpu`, error 1102), killing one request at exactly 10 ms.
- **Timing inside a Worker.** Reading `Date.now()` after a zero-length `setTimeout` measures synchronous work under `wrangler dev`, but in production it read 0 ms every time. Only `wrangler tail` (or Workers Observability) shows CPU time on Workers.
- **Fetching from a Worker changes the detections** ([S3](#s3--fetch-reliability-from-workers)): every page gained Cloudflare, wordpress.org lost Nginx, and three pages lost HTTP/3.

## S3 — Fetch reliability from Workers

**Status:** done, 2026-11-04. Spike Worker [`spikes/worker`](../spikes/worker) on the Free plan, running in Tokyo (NRT). The same probe ran from the owner's machine in Singapore as a baseline. Raw results weren't committed, since they include third-party pages.

**Method.** 60 popular homepages: search, social, commerce, news, travel and SaaS, weighted towards sites known to run bot management. One `GET` each with an honest User-Agent (`Stacter/0.0 (spike; +https://github.com/nickczj/stacter)`), redirects followed by hand (≤ 5), a 10 s timeout and no retries. Outcomes:
- `challenged`: a known bot-wall marker on an error status or a small page
- `blocked`: 401, 403, 429 or 451 with no marker
- `other`: any other status

| From | ok | challenged | blocked | other / error | Median time |
|---|---|---|---|---|---|
| The Worker | 39 | 15 | 4 | 2 (HTTP 520) | 213 ms |
| The owner's machine | 40 | 17 | 1 | 2 (timeouts) | 118 ms |

**Where the request comes from barely matters; what it looks like does.** 55 of 60 sites gave the same outcome from both places. About a third of them (19–21) challenge or block an honest non-browser request wherever it comes from:
- **Cloudflare challenge** (403, `cf-mitigated: challenge`): Quora, Stack Overflow, Medium, npm, Indeed, Glassdoor, OpenAI
- **DataDome:** Etsy, The New York Times, WSJ, Reuters, Yelp
- **AWS WAF** (a 202 with a challenge script): IMDb, Booking.com
- **PerimeterX / HUMAN:** Bloomberg
- **Akamai:** eBay, Home Depot
- **Rate limit:** Expedia (429)
- **No answer at all:** Best Buy and The Washington Post timed out locally after 10 s. From the Worker, Cloudflare gave up with its own HTTP 520.

The five differences:
- Google answered 429 only to the Worker; it rate-limits Cloudflare's egress.
- eBay and Home Depot blocked both. The Akamai marker relied on `Server: AkamaiGHost`, which the Worker never sees (below).
- Best Buy and the Post were unreachable from both.

**Every request from a Worker says so.** Requests from a Worker carry these headers:
- `Cf-Worker: x-e14.workers.dev` (the account's workers.dev subdomain)
- `Cdn-Loop: cloudflare; loops=1`
- `Cf-Ew-Via`, `Cf-Ray` and `Cf-Visitor`

Any site can tell a Worker sent the request, and whose. That's fine under D-012, and one more reason to serve Stacter from its own domain.

**`fetch()` from a Worker rewrites response headers.** This is the most important finding of the M0 spikes. Fetched from the Worker, all 58 sites that answered came back with `server: cloudflare`, a `cf-ray` and `cf-cache-status: DYNAMIC`, whatever the origin sent: Google's `gws`, Vercel, nginx, AkamaiGHost, CloudFront, DataDome, envoy. From the owner's machine, only the 14 sites really behind Cloudflare sent a `cf-ray`. `alt-svc` survived on 15 sites, against 25 locally. Other headers pass through untouched: `x-powered-by`, `x-vercel-id`, `via` and cookies. Cookies differed on 8 sites, which looks regional, since the Worker ran in Japan. Browser Run doesn't have the problem: it sees `server: nginx` and `server: Vercel` ([S5](#s5--browser-run)).

What that means for M1 and M2:
- Static scans run on Workers can't use `server`, `cf-ray` or `cf-cache-status` as evidence. Every site would show Cloudflare (S2), and the 198 technologies with a `Server` rule lose it. For 72 of them it's their only rule.
- Cloudflare itself has to be detected from DNS: NS records, plus A records announced by AS13335 (via the IP owner lookup).
- Bot-wall markers can't rely on `Server` either.
- Getting origin headers in a static scan needs something other than `fetch()`. One option is Workers TCP sockets (`connect()` with TLS) plus a minimal HTTP/1.1 client. The docs say sockets can't reach Cloudflare's own IP ranges, but DNS already identifies those sites. The other option is to take server headers from rendered scans only. New spike S8.

## S4 — DNS and IP owner

**Status:** done, from the dev container on 2026-11-03 and from Workers (NRT) on 2026-11-04 ([latency below](#from-workers)).

**DNS over HTTPS.** Cloudflare's JSON API (`https://cloudflare-dns.com/dns-query?name=…&type=…`, header `accept: application/dns-json`) answered every record type we need: A, AAAA, CNAME, NS, MX, TXT, CAA and SOA. Google's `https://dns.google/resolve` returns the same shape. Notes for the collector:
- `Answer[].type` is numeric: 1 A, 28 AAAA, 5 CNAME, 2 NS, 15 MX, 16 TXT, 257 CAA, 6 SOA.
- No records means no `Answer`, just an SOA in `Authority`.
- Cloudflare wraps TXT data in quotes and Google doesn't. Normalise both, and expect long TXT records to arrive as several quoted strings.
- From the dev container (through a proxy), each query took 80–330 ms. Queries should run in parallel, and should be faster from Workers.

What DNS alone showed for nuxt.com: NS `*.ns.cloudflare.com` (Cloudflare DNS), MX `*.mx.cloudflare.net` (Cloudflare Email Routing), TXT `google-site-verification=…` (Google Search Console). Meanwhile www.cloudflare.com and www.shopify.com resolve straight to Cloudflare A records: proxying and CNAME flattening hide the chain.

**IP owner.** Both sources agree:

| | Team Cymru, over DoH | RIPEstat |
|---|---|---|
| Lookup | TXT `<reversed-ip>.origin.asn.cymru.com` → `16509 \| 216.150.1.0/24 \| US \| arin \| …`, then TXT `AS16509.asn.cymru.com` → `… \| AMAZON-02 - Amazon.com, Inc., US` | `network-info` → ASN and prefix, then `as-overview` → holder |
| Requests | 2 DNS queries through the same DoH client | 2 HTTPS calls |
| Time from the dev container | 110–330 ms each | 380–410 ms each |

Decision D-009: Team Cymru over DoH, with RIPEstat as the fallback.

**A teaching moment:** nuxt.com is hosted on Vercel (its headers say so), but its IP, 216.150.1.1, is announced by Amazon (AS16509). The IP owner isn't the hosting platform, which is why every layer needs more than one signal.

### From Workers

These are wall times for 10 names (the S2 sites, apex and `www`). Each name got all 8 record types from each resolver in parallel, then the IP owner of its first A record:

| | From the Worker | From the owner's machine |
|---|---|---|
| Cloudflare DoH, all 8 types | 9–22 ms | 9–167 ms |
| Google DoH, all 8 types | 28–107 ms | 9–106 ms |
| IP owner via Team Cymru (2 TXT queries over Cloudflare DoH) | 153–305 ms | 252–528 ms |
| IP owner via RIPEstat (2 HTTPS calls) | 495–1,455 ms | 373–815 ms |

- From Workers, Cloudflare's resolver is the clear default: a full profile of a name takes 10–20 ms.
- Team Cymru's cost is the first query (`<ip>.origin.asn.cymru.com`), which the resolver usually has to fetch from Cymru's own servers. The `AS…` query is then cached. D-009 holds; start the IP owner lookup in parallel with the HTTP fetch.
- CPU per request (16 DoH queries plus the IP owner): 9–15 ms.

## S5 — Browser Run

**Status:** done, 2026-11-04, on the Free plan (10 browser-minutes a day). The spike Worker drove `@cloudflare/puppeteer` 1.4.0 and rendered the seven S2 pages one after another in one reused session, waiting for `networkidle2`.

**Speed and cost.**
- **Launching a browser** took 2.0–3.0 s. **Reconnecting** to a kept-alive session (`puppeteer.connect(env.BROWSER, sessionId)`) took 0.9–1.0 s. On the Free plan, `puppeteer.limits()` reported 4 concurrent sessions and one new browser at a time, roughly every 20 s.
- **Loading a page** to network idle took 2.4–8.2 s. BBC was slowest: 194 requests to 43 hosts.
- **Collecting** everything listed under "What it sees" took another 1.0–1.4 s of round trips over the DevTools protocol (CDP).
- **Idle time counts as browser time.** The seven pages plus an echo request held one session for 183 s, of which about 120 s was the `keep_alive` idle timeout before the session closed (`BrowserIdle`). Close or disconnect sessions deliberately and keep `keep_alive` short. Active time was about 8–9 s a page, and the whole spike used 355 s.
- **Workers Paid cost:** 10 browser-hours a month are included, then $0.09 an hour. At about 9 s a scan, that's roughly 4,000 rendered scans a month included and about $0.0002 a scan after that.
- **Worker CPU:** driving one rendered scan took 93–521 ms of the Worker's own CPU, spent handling a CDP message for every network response plus `page.content()`. The Free plan killed one of these requests. Rendered scans need Workers Paid, and the collector should subscribe to fewer events.

**What it sees.** For each page:
- the HTTP status and the origin's real response headers (`server: nginx`, `server: Vercel`, `x-powered-by: Next.js, Payload`)
- every network request (39–262 requests, to 3–43 hosts)
- every cookie, third-party ones included (2–36)
- the window globals the page added (15–142)
- the rendered HTML

**What it detects that a static scan can't.** Same rules, with `js` rules checked in the page:
- **react.dev:** Next.js (the static scan finds no framework)
- **bbc.com/news:** Next.js, Turbopack, Optimizely, Permutive, Chartbeat, Taboola, comScore, mParticle, ID5, SpeedCurve and more
- **vercel.com:** Next.js App Router, Sentry, Sift, Vercel Analytics, Vercel Speed Insights
- **nuxt.com:** Vercel Analytics, Vercel Speed Insights
- **shopify.com:** React Router, Facebook Pixel

**`js` rules need the whole property chain and the value.** Matching on a global's first segment alone would report 19 technologies on react.dev, where 3 are real, and 31 on BBC, where 15 are. That's because many Next.js-based products have rules like `__NEXT_DATA__.props.…`. The spike checked full property chains in the page but skipped value patterns, and that still let one false positive through on BBC: Selless, whose rule needs `__NEXT_DATA__.assetPrefix` to match `\.selless\.us/`. M3 evaluates each rule completely, inside the page.

**TLS isn't usable.** `response.securityDetails()` returns TLS 1.3 and the subject, but an empty issuer, and every certificate was "issued" minutes before the scan and valid for a year. Browser Run's browser sits behind a proxy that terminates TLS, so the site's real certificate isn't visible. A local Chrome under `wrangler dev` showed the real one (issuer YR1, valid for 90 days). That rules out S7's "rendered scans only" option.

**Identity.** Browser Run sends:
- `User-Agent: Mozilla/5.0 (X11; Linux x86_64) … HeadlessChrome/152.0.0.0 Safari/537.36`
- `Cf-Brapi-Devtools: 1`
- Web Bot Auth headers: `Signature-Agent: "https://web-bot-auth.cloudflare-browser-rendering-085.workers.dev"`, with an Ed25519 `Signature` and `Signature-Input` (`tag="web-bot-auth"`)

Sites can verify that the request came from Cloudflare's browser, and the docs say it's always treated as a bot, which fits D-012. Whether it gets past the bot walls S3 hit wasn't tested; that's a follow-up for M3.

**Gotchas.**
- `page.evaluate()` can only return primitives, so return `JSON.stringify(…)`.
- Wrangler bundles with esbuild's `keepNames`, which wraps named inner functions in a `__name()` helper. The page has no `__name`, so functions passed to `page.evaluate()` can't contain named inner functions.
- One `browser.createBrowserContext()` per scan keeps cookies separate within a reused session.
- `wrangler dev` runs the Browser Run binding against a local Chrome. That's handy for development, but its TLS details and timings aren't representative.
