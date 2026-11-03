import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// The engine must behave the same everywhere it runs (docs/PLAN.md D-005),
// so every test file runs twice: under Node and inside workerd, the runtime
// behind Cloudflare Workers.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    projects: [
      {
        extends: true,
        test: { name: 'node' },
      },
      {
        extends: true,
        plugins: [
          cloudflareTest({
            miniflare: {
              // Keep in step with apps/web/wrangler.jsonc.
              compatibilityDate: '2026-11-03',
            },
          }),
        ],
        test: { name: 'workerd' },
      },
    ],
  },
})
