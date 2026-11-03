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

**Status:** done locally, 2026-11-03; the Workers half waits for a deploy. Script: [`spikes/s2-matching-bench.mjs`](../spikes/s2-matching-bench.mjs).

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
- **Not measured yet:** `htmlparser2` extraction (M1), and CPU time on real Workers. Inside a Worker, timers don't advance during synchronous work, so this needs the deployed Worker's CPU-time metrics.

## S3 — Fetch reliability from Workers

**Status:** blocked until the Worker is deployed. One early hint from the dev container (not Workers): github.com answered a curl request that had a browser User-Agent with HTTP 400.

## S4 — DNS and IP owner

**Status:** done from the dev container, 2026-11-03; latency from Workers waits for a deploy.

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

## S5 — Browser Run

**Status:** blocked until there's a Cloudflare account.
