// Pure byte -> value parsing for the Tindeq Progressor, per
// docs/02-ble-protocol.md "Data format" / "Tindeq Progressor". No BLE or
// device dependency — see docs/07-architecture.md "BLE layer": parsers are
// pure functions so the byte-fixture tests docs/06 requires run trivially.

import type { RawSample } from '../../../core/types'

export const ProgressorResponseKind = {
  RESPONSE_COMMAND: 0,
  RESPONSE_WEIGHT_MEASUREMENT: 1,
  RESPONSE_RFD_PEAK: 2,
  RESPONSE_RFD_PEAK_SERIES: 3,
  RESPONSE_LOW_POWER_WARNING: 4,
} as const

export type ProgressorResponseKindValue =
  (typeof ProgressorResponseKind)[keyof typeof ProgressorResponseKind]

export const ProgressorCommand = {
  TARE_SCALE: 0x64,
  START_WEIGHT_MEAS: 0x65,
  STOP_WEIGHT_MEAS: 0x66,
  GET_FIRMWARE_VERSION: 0x6b,
  GET_ERROR_INFORMATION: 0x6c,
  CLR_ERROR_INFORMATION: 0x6d,
  SLEEP: 0x6e,
  GET_BATTERY_VOLTAGE: 0x6f,
  GET_PROGRESSOR_ID: 0x70,
  GET_CALIBRATION: 0x72,
  REBOOT: 0x75,
} as const

export type ProgressorFrame =
  | { kind: 'weight_measurement'; samples: RawSample[] }
  | { kind: 'battery_voltage_mv'; millivolts: number }
  | { kind: 'text'; text: string }
  | { kind: 'progressor_id'; idHex: string }
  | { kind: 'low_power_warning' }
  | { kind: 'unsupported'; rawKind: number }
  | { kind: 'malformed' }

/**
 * Parses one notification payload off the "rx" characteristic. Frame:
 * byte0 = kind, byte1 = payloadLength, bytes[2..] = payload.
 *
 * `lastCommand` disambiguates a kind===0 (RESPONSE_COMMAND) payload's shape,
 * per docs/02 "kind === 0 (command response)" — the device doesn't tag which
 * command a response belongs to, only the caller knows what it last wrote.
 */
export function parseProgressorFrame(bytes: Uint8Array, lastCommand?: number): ProgressorFrame {
  if (bytes.length < 2) return { kind: 'malformed' }

  const rawKind = bytes[0]
  const payloadLength = bytes[1]
  if (bytes.length < 2 + payloadLength) return { kind: 'malformed' }

  const payload = bytes.subarray(2, 2 + payloadLength)

  switch (rawKind) {
    case ProgressorResponseKind.RESPONSE_WEIGHT_MEASUREMENT:
      return { kind: 'weight_measurement', samples: parseWeightSamples(payload) }
    case ProgressorResponseKind.RESPONSE_COMMAND:
      return parseCommandResponse(payload, lastCommand)
    case ProgressorResponseKind.RESPONSE_LOW_POWER_WARNING:
      return { kind: 'low_power_warning' }
    case ProgressorResponseKind.RESPONSE_RFD_PEAK:
    case ProgressorResponseKind.RESPONSE_RFD_PEAK_SERIES:
      return { kind: 'unsupported', rawKind }
    default:
      return { kind: 'unsupported', rawKind }
  }
}

/**
 * kind===1 payload: payloadLength/8 samples, each 8 bytes:
 *   +0 float32 LE weight (kg, signed)
 *   +4 uint32  LE device timestamp (microseconds, device's own clock)
 * Non-finite weights are skipped per-sample rather than propagated.
 */
function parseWeightSamples(payload: Uint8Array): RawSample[] {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const sampleCount = Math.floor(payload.length / 8)
  const samples: RawSample[] = []

  for (let i = 0; i < sampleCount; i++) {
    const offset = i * 8
    const forceKg = view.getFloat32(offset, true)
    if (!Number.isFinite(forceKg)) continue
    const deviceTimestampUs = view.getUint32(offset + 4, true)
    samples.push({ forceKg, deviceTimestampMs: deviceTimestampUs / 1000 })
  }

  return samples
}

function parseCommandResponse(payload: Uint8Array, lastCommand?: number): ProgressorFrame {
  switch (lastCommand) {
    case ProgressorCommand.GET_BATTERY_VOLTAGE: {
      if (payload.length < 4) return { kind: 'malformed' }
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
      return { kind: 'battery_voltage_mv', millivolts: view.getUint32(0, true) }
    }
    case ProgressorCommand.GET_FIRMWARE_VERSION:
    case ProgressorCommand.GET_ERROR_INFORMATION:
      return { kind: 'text', text: decodeUtf8(payload) }
    case ProgressorCommand.GET_PROGRESSOR_ID: {
      // 8 bytes, reversed then hex-encoded MSB-first, per docs/02 — matches
      // Tindeq's own app formatting.
      const reversed = Array.from(payload).reverse()
      const idHex = reversed.map((b) => b.toString(16).padStart(2, '0')).join('')
      return { kind: 'progressor_id', idHex }
    }
    default:
      return { kind: 'unsupported', rawKind: ProgressorResponseKind.RESPONSE_COMMAND }
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  let result = ''
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i])
  }
  // ASCII-safe decode is sufficient for firmware version/error strings;
  // avoids a TextDecoder dependency that isn't guaranteed on Hermes.
  return result
}
