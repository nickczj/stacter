# Stacter

See how any website is built, and learn how we can tell.

Stacter scans a URL and lays out its technology stack in the order a request travels: DNS → edge/CDN → hosting → server → framework → frontend → third-party services. Every detection comes with its evidence (for example, Cloudflare from the `cf-ray` response header, or Nuxt from `window.__NUXT__` and `/_nuxt/` asset paths), a plain-language explanation, and a way to verify it yourself.

**Status:** planning. See [docs/PLAN.md](docs/PLAN.md) for the roadmap, design and progress log.
