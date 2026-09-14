import { parseWhc06Advertisement } from '../../../src/services/ble/parsers/whc06'
import { weightPayload } from '../fixtures/whc06Payloads'

describe('parseWhc06Advertisement', () => {
  it('decodes the docs/02 worked example: 0x04D2 = 1234 -> 12.34 kg', () => {
    const payload = weightPayload(0x04d2)
    const result = parseWhc06Advertisement(payload)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.sample.forceKg).toBeCloseTo(12.34, 4)
  })

  it('decodes zero weight correctly', () => {
    const payload = weightPayload(0)
    const result = parseWhc06Advertisement(payload)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.sample.forceKg).toBe(0)
  })

  it('decodes the maximum representable uint16 weight without overflow', () => {
    const payload = weightPayload(0xffff)
    const result = parseWhc06Advertisement(payload)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.sample.forceKg).toBeCloseTo(655.35, 4)
  })

  it('does not attach a device timestamp — WH-C06 has none, per docs/02', () => {
    const payload = weightPayload(1000)
    const result = parseWhc06Advertisement(payload)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.sample.deviceTimestampMs).toBeUndefined()
  })

  it('rejects a payload shorter than the weight field (truncated advertisement)', () => {
    const shortPayload = new Uint8Array(10) // offsets 10-11 don't exist
    const result = parseWhc06Advertisement(shortPayload)
    expect(result.ok).toBe(false)
  })

  it('reads big-endian, not little-endian (0x04D2 must not decode as 0xD204)', () => {
    const payload = weightPayload(0x04d2)
    // sanity: confirm the raw bytes are actually BE-ordered as documented
    expect(payload[10]).toBe(0x04)
    expect(payload[11]).toBe(0xd2)

    const result = parseWhc06Advertisement(payload)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    // 0xD204 / 100 = 538.60, which would indicate a BE/LE mixup if seen
    expect(result.sample.forceKg).not.toBeCloseTo(538.6, 1)
    expect(result.sample.forceKg).toBeCloseTo(12.34, 4)
  })
})
