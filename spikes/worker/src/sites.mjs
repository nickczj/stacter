// Fixed target lists. The spike Worker only fetches these, so it can't be used as an open proxy.

/** S2: the seven pages benchmarked locally in docs/spikes.md. */
export const S2_PAGES = {
  wordpress: 'https://wordpress.org/news/',
  react: 'https://react.dev/',
  bbc: 'https://www.bbc.com/news',
  nuxt: 'https://nuxt.com/',
  vercel: 'https://vercel.com/',
  shopify: 'https://www.shopify.com/',
  cloudflare: 'https://www.cloudflare.com/',
}

/** S3: popular homepages, weighted towards sites known to run bot management. */
export const S3_SITES = [
  // Search, social, video
  'https://www.google.com/', 'https://www.youtube.com/', 'https://www.facebook.com/', 'https://www.instagram.com/',
  'https://x.com/', 'https://www.linkedin.com/', 'https://www.reddit.com/', 'https://www.tiktok.com/',
  'https://www.pinterest.com/', 'https://www.twitch.tv/', 'https://discord.com/', 'https://www.quora.com/',
  // Reference and developer
  'https://en.wikipedia.org/', 'https://github.com/', 'https://stackoverflow.com/', 'https://www.imdb.com/',
  'https://medium.com/', 'https://wordpress.org/', 'https://www.npmjs.com/', 'https://developer.mozilla.org/',
  // Commerce
  'https://www.amazon.com/', 'https://www.ebay.com/', 'https://www.walmart.com/', 'https://www.target.com/',
  'https://www.bestbuy.com/', 'https://www.etsy.com/', 'https://www.nike.com/', 'https://www.ikea.com/',
  'https://www.homedepot.com/', 'https://www.shopify.com/',
  // News
  'https://www.nytimes.com/', 'https://www.bbc.com/', 'https://www.cnn.com/', 'https://www.theguardian.com/',
  'https://www.washingtonpost.com/', 'https://www.wsj.com/', 'https://www.bloomberg.com/', 'https://www.reuters.com/',
  // Travel, jobs, property, tickets
  'https://www.airbnb.com/', 'https://www.booking.com/', 'https://www.expedia.com/', 'https://www.zillow.com/',
  'https://www.indeed.com/', 'https://www.glassdoor.com/', 'https://www.ticketmaster.com/', 'https://www.yelp.com/',
  // SaaS and infrastructure
  'https://www.apple.com/', 'https://www.microsoft.com/', 'https://www.netflix.com/', 'https://www.spotify.com/',
  'https://stripe.com/', 'https://www.paypal.com/', 'https://openai.com/', 'https://www.notion.com/',
  'https://www.figma.com/', 'https://www.canva.com/', 'https://www.cloudflare.com/', 'https://vercel.com/',
  'https://nuxt.com/', 'https://react.dev/',
]

/** S4: the S2 sites' registrable domains, plus their www hosts where those differ. */
export const S4_DOMAINS = ['nuxt.com', 'react.dev', 'vercel.com', 'wordpress.org', 'bbc.com', 'www.bbc.com', 'shopify.com', 'www.shopify.com', 'cloudflare.com', 'www.cloudflare.com']

/** Echo services that show the request headers a target sees. */
export const ECHO_URL = 'https://httpbin.org/headers'
