<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<style>
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #0f172a;
  --muted: #475569;
  --border: #e2e8f0;
  --surface: #f8fafc;
  --badge-bg: #dcfce7;
  --badge-fg: #166534;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b1120;
    --fg: #e2e8f0;
    --muted: #94a3b8;
    --border: #1e293b;
    --surface: #111827;
    --badge-bg: #14532d;
    --badge-fg: #bbf7d0;
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
}
</style>
