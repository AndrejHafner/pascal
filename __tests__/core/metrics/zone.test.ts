import { classifyZone } from '../../../src/core/metrics/zone'
import type { Band } from '../../../src/core/metrics/band'

const band: Band = { targetKg: 30, toleranceKg: 5 } // [25, 35]

describe('classifyZone', () => {
  it('classifies the exact lower bound as in, not below', () => {
    expect(classifyZone(25, band)).toBe('in')
  })

  it('classifies the exact upper bound as in, not above', () => {
    expect(classifyZone(35, band)).toBe('in')
  })

  it('classifies just below the lower bound as below', () => {
    expect(classifyZone(24.99, band)).toBe('below')
  })

  it('classifies just above the upper bound as above', () => {
    expect(classifyZone(35.01, band)).toBe('above')
  })

  it('classifies the nominal target as in', () => {
    expect(classifyZone(30, band)).toBe('in')
  })

  it('classifies zero force as below for any positive-target band', () => {
    expect(classifyZone(0, band)).toBe('below')
  })
})
