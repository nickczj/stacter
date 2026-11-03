# Stacter

See how any website is built, and learn how we can tell.

Stacter scans a URL and lays out its technology stack in the order a request travels: DNS → edge/CDN → hosting → server → framework → frontend → third-party services. Every detection comes with its evidence (for example, Cloudflare from the `cf-ray` response header, or Nuxt from `window.__NUXT__` and `/_nuxt/` asset paths), a plain-language explanation, and a way to verify it yourself.

**Status:** early development (milestone M0). See [docs/PLAN.md](docs/PLAN.md) for the roadmap, design and progress log.

## Repository layout

| Path | What it is |
|---|---|
| `apps/web` | The website: Nuxt 4 on Cloudflare Workers |
| `packages/engine` | `@stacter/engine`, the detection engine: portable TypeScript with no runtime-specific APIs |
| `docs/` | The plan, decisions and spike write-ups |

## Development

You need [Bun](https://bun.sh) (the version is pinned in `package.json`) and Node.js 24 (see `.node-version`). Bun installs packages and runs scripts; the production code runs on Cloudflare's workerd runtime.

```bash
bun install
```

| Command | What it does |
|---|---|
| `bun run dev` | Nuxt dev server on http://localhost:3000 |
| `bun run test` | Engine tests, run under both Node and workerd |
| `bun run lint` | ESLint, including formatting (`bun run lint:fix` to fix) |
| `bun run typecheck` | TypeScript checks for every workspace |
| `bun run build` | Production build for Cloudflare Workers |
| `bun run preview` | Build, then serve the Worker locally in workerd (`wrangler dev`) |

## Deploying

Pushes to `main` deploy to Cloudflare Workers through GitHub Actions, once these two repository secrets exist:

- `CLOUDFLARE_API_TOKEN`: an API token created from the "Edit Cloudflare Workers" template
- `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID

Without them, CI still runs and the deploy job is skipped. To deploy by hand instead, log in once:

```bash
cd apps/web && bunx wrangler login
```

Then deploy from the repository root:

```bash
bun run deploy
```

## License

[GPL-3.0-only](LICENSE). Stacter's detection rules will come from [enthec/webappanalyzer](https://github.com/enthec/webappanalyzer), which is also licensed under GPL-3.0.
