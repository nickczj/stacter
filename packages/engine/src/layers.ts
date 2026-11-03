export interface LayerInfo {
  /** Stable identifier, used in scan results and URLs. */
  readonly id: string
  /** Display name. */
  readonly name: string
  /** The question this layer answers, in plain language. */
  readonly question: string
}

/**
 * The layers of a website's stack, in the order a request travels through
 * them: from the domain name to the third parties the page calls.
 * See docs/PLAN.md §4.
 */
export const LAYERS = [
  {
    id: 'dns',
    name: 'Domain & DNS',
    question: 'Who answers for the name, who handles email, and which services has the domain verified?',
  },
  {
    id: 'edge',
    name: 'Edge & CDN',
    question: 'Who receives the request first, caches it and protects it?',
  },
  {
    id: 'hosting',
    name: 'Hosting & platform',
    question: 'Where does the site actually run?',
  },
  {
    id: 'server',
    name: 'Server & runtime',
    question: 'What software answers the request?',
  },
  {
    id: 'framework',
    name: 'Framework & CMS',
    question: 'What builds the pages?',
  },
  {
    id: 'frontend',
    name: 'Frontend & UI',
    question: 'What runs in the browser?',
  },
  {
    id: 'services',
    name: 'Third-party services',
    question: 'Who else does the page call?',
  },
] as const satisfies readonly LayerInfo[]

/** A layer id, or `other` for technologies not yet mapped to a layer. */
export type Layer = (typeof LAYERS)[number]['id'] | 'other'
