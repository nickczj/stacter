/// <reference types="../worker-configuration.d.ts" />

// Types for `event.context.cloudflare` in server routes. `Env` (the
// bindings) comes from worker-configuration.d.ts, which `wrangler types`
// generates from wrangler.jsonc on install.
declare module 'h3' {
  interface H3EventContext {
    cf: CfProperties
    cloudflare: {
      request: Request
      env: Env
      context: ExecutionContext
    }
  }
}

export {}
