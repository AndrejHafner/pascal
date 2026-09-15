import { formatSeconds, formatMinutesSeconds } from '../../src/features/session/formatDuration'

describe('formatSeconds', () => {
  it('formats whole and fractional seconds with one decimal', () => {
    expect(formatSeconds(7200)).toBe('7.2s')
    expect(formatSeconds(0)).toBe('0.0s')
    expect(formatSeconds(12000)).toBe('12.0s')
  })
})

describe('formatMinutesSeconds', () => {
  it('formats as mm:ss with zero-padded seconds', () => {
    expect(formatMinutesSeconds(180_000)).toBe('3:00')
    expect(formatMinutesSeconds(65_000)).toBe('1:05')
    expect(formatMinutesSeconds(5000)).toBe('0:05')
  })

  it('rounds up to the nearest second (never shows 0:00 while time remains)', () => {
    expect(formatMinutesSeconds(500)).toBe('0:01')
  })

  it('clamps negative input to 0:00', () => {
    expect(formatMinutesSeconds(-100)).toBe('0:00')
  })
})
