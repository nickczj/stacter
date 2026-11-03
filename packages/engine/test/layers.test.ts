import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { ENGINE_VERSION, LAYERS } from '../src'

describe('LAYERS', () => {
  it('lists the layers in the order a request travels', () => {
    expect(LAYERS.map(layer => layer.id)).toEqual([
      'dns',
      'edge',
      'hosting',
      'server',
      'framework',
      'frontend',
      'services',
    ])
  })

  it('gives every layer a name and a plain-language question', () => {
    for (const layer of LAYERS) {
      expect(layer.name.trim()).not.toBe('')
      expect(layer.question).toMatch(/\?$/)
    }
  })
})

describe('ENGINE_VERSION', () => {
  it('matches the package version', () => {
    expect(ENGINE_VERSION).toBe(pkg.version)
  })
})
