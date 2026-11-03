// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // Exposes Cloudflare bindings (KV, D1, …) to `nuxt dev` via Wrangler.
  modules: ['nitro-cloudflare-dev'],

  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },

  compatibilityDate: '2025-07-15',

  // Cloudflare Workers + Static Assets (docs/PLAN.md D-003). Nitro writes
  // the final Wrangler config to .output/ and points `wrangler deploy` at it.
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },
})
