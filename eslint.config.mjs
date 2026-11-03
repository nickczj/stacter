// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config'

export default createConfigForNuxt({
  features: {
    // Formatting via ESLint Stylistic: 2 spaces, single quotes, no semicolons.
    stylistic: true,
  },
  dirs: {
    // The Nuxt app lives in apps/web, with its source in apps/web/app.
    root: ['./apps/web', './apps/web/app'],
  },
})
  .prepend({
    name: 'stacter/ignores',
    ignores: ['**/worker-configuration.d.ts'],
  })
  .append({
    // The engine must stay portable (docs/PLAN.md D-004, D-005): web-standard
    // APIs only, so the same code runs in Workers, Bun, Node and browsers.
    name: 'stacter/engine-portability',
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['node:*', 'bun', 'bun:*', 'cloudflare:*', 'fs', 'fs/*', 'path', 'os', 'child_process', 'http', 'https', 'net', 'tls', 'dns', 'worker_threads'],
          message: 'The engine must stay portable: use web-standard APIs, not runtime-specific modules.',
        }],
      }],
      'no-restricted-globals': ['error',
        ...['Bun', 'Deno', 'process', 'Buffer', 'require', '__dirname', '__filename'].map(name => ({
          name,
          message: 'The engine must stay portable: use web-standard APIs, not runtime-specific globals.',
        })),
      ],
    },
  })
