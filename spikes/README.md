# Spikes

Throwaway scripts from the M0 spikes. Findings are in [docs/spikes.md](../docs/spikes.md); the real implementation comes in M1, inside `@stacter/engine`, with tests.

The scripts take their data as arguments and never run anything from it.

## Data

Fingerprints, cloned outside this repo:

```bash
git clone --depth 1 https://github.com/enthec/webappanalyzer ../webappanalyzer
```

Sample pages for S2, one `<name>.html` and `<name>.headers` pair per site, in a directory of their own:

```bash
mkdir -p ../s2-pages && curl -sSL --compressed -D ../s2-pages/nuxt.headers -o ../s2-pages/nuxt.html https://nuxt.com/
```

## Run

```bash
node spikes/s1-fingerprints.mjs ../webappanalyzer
```

```bash
node spikes/s2-matching-bench.mjs ../webappanalyzer ../s2-pages aho
```

The S2 modes are `naive`, `includes` and `aho`, the three approaches compared in docs/spikes.md. The scripts also run under Bun. The matcher itself lives in [`lib/matching.mjs`](lib/matching.mjs), shared with the spike Worker.

## Spike Worker (S2, S3, S4 and S5 on Cloudflare)

[`worker/`](worker) is a throwaway Worker, `stacter-spikes`, separate from the app and its deploys. It measures matching on workerd (S2), fetch reliability from Cloudflare's network (S3), DoH and IP-owner latency (S4), and Browser Run (S5). Every route needs `Authorization: Bearer <SPIKE_TOKEN>` and only fetches the fixed lists in [`worker/src/sites.mjs`](worker/src/sites.mjs), so it can't be used as an open proxy. It's a standalone package, not a workspace member:

```bash
cd spikes/worker
bun install
node pack-fingerprints.mjs ../../../webappanalyzer   # writes .data/technologies.json (gitignored)
bunx wrangler login
bunx wrangler deploy --var SPIKE_TOKEN:$(openssl rand -hex 16)
```

Then, from the repository root, tail the Worker for CPU times while the runner drives it. The runner also runs the S3 and S4 probes locally as a baseline:

```bash
mkdir -p ../spike-results
(cd spikes/worker && bunx wrangler tail stacter-spikes --format json > ../../../spike-results/tail.json) &
SPIKE_TOKEN=… node spikes/worker/run.mjs https://stacter-spikes.<subdomain>.workers.dev ../spike-results
node spikes/worker/run.mjs tail ../spike-results/tail.json
```

When the findings are recorded, delete the Worker with `bunx wrangler delete` (from `spikes/worker`).
