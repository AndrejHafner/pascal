// Hand-constructed Progressor packets matching the byte layout in
// docs/02-ble-protocol.md exactly — the canonical reference for what
// "correct" parsing means. Modeled on Grip Connect's own test fixture
// approach (progressorWeightPacket in their test/helpers.mjs).

import { ProgressorCommand } from '../../../src/services/ble/parsers/progressor'

/** One kind===1 weight-measurement notification with N batched 8-byte samples. */
export function weightMeasurementPacket(
  samples: { weightKg: number; timestampUs: number }[],
): Uint8Array {
  const payloadLength = samples.length * 8
  const bytes = new Uint8Array(2 + payloadLength)
  const view = new DataView(bytes.buffer)

  bytes[0] = 1 // RESPONSE_WEIGHT_MEASUREMENT
  bytes[1] = payloadLength

  samples.forEach(({ weightKg, timestampUs }, i) => {
    const offset = 2 + i * 8
    view.setFloat32(offset, weightKg, true)
    view.setUint32(offset + 4, timestampUs, true)
  })

  return bytes
}

export function batteryVoltageResponsePacket(millivolts: number): Uint8Array {
  const bytes = new Uint8Array(2 + 4)
  const view = new DataView(bytes.buffer)
  bytes[0] = 0 // RESPONSE_COMMAND
  bytes[1] = 4
  view.setUint32(2, millivolts, true)
  return bytes
}

export function firmwareVersionResponsePacket(text: string): Uint8Array {
  const textBytes = Array.from(text).map((c) => c.charCodeAt(0))
  const bytes = new Uint8Array(2 + textBytes.length)
  bytes[0] = 0
  bytes[1] = textBytes.length
  bytes.set(textBytes, 2)
  return bytes
}

/** 8 raw ID bytes as they'd appear on the wire (before the reverse+hex step). */
export function progressorIdResponsePacket(idBytesMsbFirst: number[]): Uint8Array {
  // The device sends the ID reversed relative to the display format — see
  // docs/02: "8 bytes, reversed then hex-encoded MSB-first". So to produce
  // a wire packet that decodes to a *known* display hex string, we send the
  // reverse of the desired display bytes.
  const wireBytes = [...idBytesMsbFirst].reverse()
  const bytes = new Uint8Array(2 + 8)
  bytes[0] = 0
  bytes[1] = 8
  bytes.set(wireBytes, 2)
  return bytes
}

export function lowPowerWarningPacket(): Uint8Array {
  return new Uint8Array([4, 0])
}

export function rfdPeakPacket(): Uint8Array {
  return new Uint8Array([2, 0])
}

export const commands = ProgressorCommand
