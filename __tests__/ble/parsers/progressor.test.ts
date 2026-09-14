import {
  parseProgressorFrame,
  ProgressorCommand,
} from '../../../src/services/ble/parsers/progressor'
import {
  weightMeasurementPacket,
  batteryVoltageResponsePacket,
  firmwareVersionResponsePacket,
  progressorIdResponsePacket,
  lowPowerWarningPacket,
  rfdPeakPacket,
} from '../fixtures/progressorPackets'

/**
 * Byte-level fixture tests — per docs/06-non-functional-and-open-source.md
 * "A parser regression is the worst possible bug here: it silently
 * corrupts training data that looks plausible." These pin the exact wire
 * format in docs/02-ble-protocol.md, not just "some value comes out."
 */
describe('parseProgressorFrame — weight measurement', () => {
  it('decodes a single 8-byte sample: float32 LE weight, uint32 LE timestamp', () => {
    const packet = weightMeasurementPacket([{ weightKg: 23.45, timestampUs: 1_000_000 }])
    const frame = parseProgressorFrame(packet)

    expect(frame.kind).toBe('weight_measurement')
    if (frame.kind !== 'weight_measurement') throw new Error('unreachable')
    expect(frame.samples).toHaveLength(1)
    expect(frame.samples[0].forceKg).toBeCloseTo(23.45, 4)
    // device timestamp arrives in microseconds on the wire, stored as ms
    expect(frame.samples[0].deviceTimestampMs).toBeCloseTo(1000, 4)
  })

  it('decodes multiple batched samples from one notification (payloadLength / 8)', () => {
    const packet = weightMeasurementPacket([
      { weightKg: 10, timestampUs: 0 },
      { weightKg: 20, timestampUs: 16_667 },
      { weightKg: 30, timestampUs: 33_333 },
    ])
    const frame = parseProgressorFrame(packet)

    expect(frame.kind).toBe('weight_measurement')
    if (frame.kind !== 'weight_measurement') throw new Error('unreachable')
    expect(frame.samples.map((s) => s.forceKg)).toEqual([10, 20, 30])
  })

  it('preserves a negative weight (sign flips with pull direction, per docs/02)', () => {
    const packet = weightMeasurementPacket([{ weightKg: -5.5, timestampUs: 0 }])
    const frame = parseProgressorFrame(packet)

    expect(frame.kind).toBe('weight_measurement')
    if (frame.kind !== 'weight_measurement') throw new Error('unreachable')
    expect(frame.samples[0].forceKg).toBeCloseTo(-5.5, 4)
  })

  it('skips a non-finite (NaN) sample without corrupting the others', () => {
    const packet = weightMeasurementPacket([
      { weightKg: 10, timestampUs: 0 },
      { weightKg: NaN, timestampUs: 16_667 },
      { weightKg: 30, timestampUs: 33_333 },
    ])
    const frame = parseProgressorFrame(packet)

    expect(frame.kind).toBe('weight_measurement')
    if (frame.kind !== 'weight_measurement') throw new Error('unreachable')
    expect(frame.samples.map((s) => s.forceKg)).toEqual([10, 30])
  })

  it('skips a non-finite (Infinity) sample without corrupting the others', () => {
    const packet = weightMeasurementPacket([
      { weightKg: Infinity, timestampUs: 0 },
      { weightKg: 12.3, timestampUs: 16_667 },
    ])
    const frame = parseProgressorFrame(packet)

    expect(frame.kind).toBe('weight_measurement')
    if (frame.kind !== 'weight_measurement') throw new Error('unreachable')
    expect(frame.samples).toHaveLength(1)
    expect(frame.samples[0].forceKg).toBeCloseTo(12.3, 4)
  })

  it('handles a zero-sample (empty payload) weight measurement without throwing', () => {
    const packet = weightMeasurementPacket([])
    const frame = parseProgressorFrame(packet)

    expect(frame.kind).toBe('weight_measurement')
    if (frame.kind !== 'weight_measurement') throw new Error('unreachable')
    expect(frame.samples).toEqual([])
  })
})

describe('parseProgressorFrame — malformed / truncated packets', () => {
  it('rejects a packet shorter than the 2-byte header', () => {
    expect(parseProgressorFrame(new Uint8Array([1]))).toEqual({ kind: 'malformed' })
    expect(parseProgressorFrame(new Uint8Array([]))).toEqual({ kind: 'malformed' })
  })

  it('rejects a packet whose declared payloadLength exceeds the actual bytes present', () => {
    // header claims 16 bytes of payload but only 4 are actually present
    const truncated = new Uint8Array([1, 16, 0, 0, 0, 0])
    expect(parseProgressorFrame(truncated)).toEqual({ kind: 'malformed' })
  })

  it('does not throw on a truncated weight sample (payload not a multiple of 8)', () => {
    // payloadLength=5 is declared and present, but 5 bytes is not a whole sample
    const bytes = new Uint8Array([1, 5, 0, 0, 0, 0, 0])
    const frame = parseProgressorFrame(bytes)
    expect(frame.kind).toBe('weight_measurement')
    if (frame.kind !== 'weight_measurement') throw new Error('unreachable')
    expect(frame.samples).toEqual([]) // floor(5/8) = 0 whole samples
  })
})

describe('parseProgressorFrame — command responses (kind===0)', () => {
  it('decodes GET_BATTERY_VOLTAGE as uint32 LE millivolts', () => {
    const packet = batteryVoltageResponsePacket(4123)
    const frame = parseProgressorFrame(packet, ProgressorCommand.GET_BATTERY_VOLTAGE)
    expect(frame).toEqual({ kind: 'battery_voltage_mv', millivolts: 4123 })
  })

  it('decodes GET_FIRMWARE_VERSION as UTF-8/ASCII text', () => {
    const packet = firmwareVersionResponsePacket('v2.1.0')
    const frame = parseProgressorFrame(packet, ProgressorCommand.GET_FIRMWARE_VERSION)
    expect(frame).toEqual({ kind: 'text', text: 'v2.1.0' })
  })

  it('decodes GET_PROGRESSOR_ID as 8 bytes reversed then hex-encoded MSB-first', () => {
    // Display id "0102030405060708" means the wire bytes are its reverse.
    const packet = progressorIdResponsePacket([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
    const frame = parseProgressorFrame(packet, ProgressorCommand.GET_PROGRESSOR_ID)
    expect(frame).toEqual({ kind: 'progressor_id', idHex: '0102030405060708' })
  })

  it('returns unsupported for a command response with no matching lastCommand', () => {
    const packet = batteryVoltageResponsePacket(4123)
    const frame = parseProgressorFrame(packet, undefined)
    expect(frame).toEqual({ kind: 'unsupported', rawKind: 0 })
  })
})

describe('parseProgressorFrame — other kinds', () => {
  it('decodes RESPONSE_LOW_POWER_WARNING (kind=4)', () => {
    expect(parseProgressorFrame(lowPowerWarningPacket())).toEqual({ kind: 'low_power_warning' })
  })

  it('flags RESPONSE_RFD_PEAK (kind=2) as unsupported, not an error', () => {
    expect(parseProgressorFrame(rfdPeakPacket())).toEqual({ kind: 'unsupported', rawKind: 2 })
  })

  it('flags an unknown kind byte as unsupported rather than throwing', () => {
    expect(parseProgressorFrame(new Uint8Array([99, 0]))).toEqual({
      kind: 'unsupported',
      rawKind: 99,
    })
  })
})
