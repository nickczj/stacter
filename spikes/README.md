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

The S2 modes are `naive`, `includes` and `aho`, the three approaches compared in docs/spikes.md. The scripts also run under Bun.
