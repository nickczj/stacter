import { ENGINE_VERSION } from '@stacter/engine'

export default defineEventHandler(() => ({
  status: 'ok',
  engine: ENGINE_VERSION,
  // "Cloudflare-Workers" when running on workerd, "Node.js/…" under `nuxt dev`.
  runtime: globalThis.navigator?.userAgent ?? 'unknown',
}))
