import { theme } from '../src/theme/tokens'

// Phase 0 smoke test — proves Jest, TypeScript, and the module graph work
// together in CI. Real tests start in Phase 1 (docs/08-roadmap.md): parser
// fixtures, metric math, and the session state machine.
describe('theme tokens', () => {
  it('defines a single dark palette with no light variant', () => {
    expect(theme.colors.bg).toBe('#0B0D0E')
    expect(theme.colors).not.toHaveProperty('bgLight')
  })

  it('keeps zoneIn and zoneAbove as distinct but related hues', () => {
    expect(theme.colors.zoneIn).not.toBe(theme.colors.zoneAbove)
  })
})
