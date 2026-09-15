import { styleForZone } from '../../src/features/chart/zoneStyle'
import { colors } from '../../src/theme/tokens'

// Pins the exact table from docs/05-design.md "Live force curve" — these
// values are a design contract, not implementation detail, so a change
// here should be a deliberate design decision, not an accidental drift.
describe('styleForZone', () => {
  it('below: zoneBelow grey, thinner trace, clock stopped', () => {
    const style = styleForZone('below')
    expect(style.bandFillColor).toBe(colors.zoneBelow)
    expect(style.bandFillOpacity).toBeCloseTo(0.1, 4)
    expect(style.traceColor).toBe(colors.textTertiary)
    expect(style.traceWidth).toBe(3)
  })

  it('in: zoneIn green, thicker trace', () => {
    const style = styleForZone('in')
    expect(style.bandFillColor).toBe(colors.zoneIn)
    expect(style.bandFillOpacity).toBeCloseTo(0.18, 4)
    expect(style.traceColor).toBe(colors.zoneIn)
    expect(style.traceWidth).toBe(3.5)
  })

  it('above: zoneAbove teal (a shift of zoneIn, never a new/error-reading hue)', () => {
    const style = styleForZone('above')
    expect(style.bandFillColor).toBe(colors.zoneAbove)
    expect(style.traceColor).toBe(colors.zoneAbove)
    expect(style.traceWidth).toBe(3.5)
    expect(style.bandFillColor).not.toBe(colors.danger)
    expect(style.traceColor).not.toBe(colors.danger)
  })

  it('in-band and above-band share the same trace width (both mean "clock running")', () => {
    expect(styleForZone('in').traceWidth).toBe(styleForZone('above').traceWidth)
  })

  it('below-band trace is thinner than an active (in/above) trace — a non-color cue', () => {
    expect(styleForZone('below').traceWidth).toBeLessThan(styleForZone('in').traceWidth)
  })
})
