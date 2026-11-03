<script setup lang="ts">
import { LAYERS } from '@stacter/engine'

useSeoMeta({
  title: 'Stacter: see how any website is built',
  description: 'Stacter lays out a website\'s technology stack in the order a request travels, with the evidence behind every detection.',
})
</script>

<template>
  <main class="page">
    <header class="intro">
      <p class="status">
        In development
      </p>
      <h1>Stacter</h1>
      <p class="tagline">
        See how any website is built, and learn how we can tell.
      </p>
    </header>

    <section aria-labelledby="layers-title">
      <h2 id="layers-title">
        Layer by layer, in request order
      </h2>
      <p>
        Stacter lays out a site's stack in the order a request travels through it,
        from the domain name to the third parties the page calls.
      </p>
      <ol class="layers">
        <li
          v-for="layer in LAYERS"
          :key="layer.id"
          class="layer"
        >
          <span class="layer-name">{{ layer.name }}</span>
          <span class="layer-question">{{ layer.question }}</span>
        </li>
      </ol>
    </section>

    <section aria-labelledby="evidence-title">
      <h2 id="evidence-title">
        Evidence for every detection
      </h2>
      <p>
        Each detection shows the exact signal that gave the technology away,
        why it does, and how to check it yourself.
      </p>
      <article
        class="evidence"
        aria-label="Example detection"
      >
        <header class="evidence-header">
          <strong>Cloudflare</strong>
          <span class="evidence-layer">Edge &amp; CDN</span>
          <span class="badge">Confirmed</span>
        </header>
        <dl>
          <dt>Signal</dt>
          <dd>Response header <code>cf-ray: a54c023de8aa0a11-IAD</code></dd>
          <dt>Why</dt>
          <dd>
            Cloudflare adds a Ray ID to every response it proxies.
            The suffix is the data centre that handled the request.
          </dd>
          <dt>Verify it yourself</dt>
          <dd><code>curl -sI https://example.com | grep -i cf-ray</code></dd>
        </dl>
        <p class="note">
          Example from a real request. Scanning isn't live yet.
        </p>
      </article>
    </section>

    <footer class="footer">
      <p>Stacter is free software, licensed under the GNU GPL v3.</p>
    </footer>
  </main>
</template>

<style scoped>
.page {
  max-width: 46rem;
  margin: 0 auto;
  padding: 3rem 1.25rem 4rem;
}

.status {
  display: inline-block;
  margin: 0 0 1rem;
  padding: 0.1rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.8rem;
  color: var(--muted);
}

h1 {
  margin: 0;
  font-size: clamp(2.5rem, 8vw, 3.5rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.tagline {
  margin: 0.75rem 0 0;
  font-size: 1.25rem;
  color: var(--muted);
}

section {
  margin-top: 3rem;
}

h2 {
  margin: 0 0 0.5rem;
  font-size: 1.35rem;
}

.layers {
  margin: 1.5rem 0 0;
  padding: 0;
  list-style: none;
  counter-reset: layer;
}

.layer {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 0 0 1.25rem 2.75rem;
  counter-increment: layer;
}

/* Numbered marker, joined to the next layer by a line: the request's path. */
.layer::before {
  content: counter(layer);
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  font-size: 0.85rem;
  font-weight: 600;
}

.layer:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 1.9rem;
  bottom: 0;
  left: 0.95rem;
  border-left: 1px solid var(--border);
}

.layer-name {
  font-weight: 600;
  line-height: 1.9rem;
}

.layer-question {
  color: var(--muted);
}

.evidence {
  margin-top: 1.5rem;
  padding: 1.25rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface);
}

.evidence-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-bottom: 1rem;
}

.evidence-layer {
  color: var(--muted);
}

.badge {
  margin-left: auto;
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  background: var(--badge-bg);
  color: var(--badge-fg);
  font-size: 0.8rem;
  font-weight: 600;
}

dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.5rem 1rem;
  margin: 0;
}

dt {
  font-weight: 600;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.note {
  margin: 1rem 0 0;
  font-size: 0.85rem;
  color: var(--muted);
}

.footer {
  margin-top: 4rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
  font-size: 0.875rem;
  color: var(--muted);
}

@media (max-width: 34rem) {
  dl {
    grid-template-columns: 1fr;
  }

  dt:not(:first-child) {
    margin-top: 0.5rem;
  }
}
</style>
