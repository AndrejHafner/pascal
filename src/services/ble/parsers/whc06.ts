// Pure byte -> value parsing for the Weiheng WH-C06, per
// docs/02-ble-protocol.md "Data format" / "Weiheng WH-C06". One sample per
// BLE advertisement, no batching, no device-native timestamp.

import type { RawSample } from '../../../core/types'

/** Manufacturer data company identifier used to filter WH-C06 advertisements. */
export const WHC06_MANUFACTURER_ID = 0x0100

const WEIGHT_OFFSET = 10

export type Whc06ParseResult = { ok: true; sample: RawSample } | { ok: false; reason: string }

/**
 * Parses the manufacturer-data payload of one advertisement event.
 * offset 10-11: uint16 BE weight = (byte[10] << 8) | byte[11]; /100 -> kg.
 * No device timestamp — caller stamps on receipt.
 */
export function parseWhc06Advertisement(manufacturerData: Uint8Array): Whc06ParseResult {
  if (manufacturerData.length < WEIGHT_OFFSET + 2) {
    return { ok: false, reason: 'payload too short for weight field' }
  }

  const weightRaw = (manufacturerData[WEIGHT_OFFSET] << 8) | manufacturerData[WEIGHT_OFFSET + 1]
  const forceKg = weightRaw / 100

  if (!Number.isFinite(forceKg)) {
    return { ok: false, reason: 'non-finite weight' }
  }

  return { ok: true, sample: { forceKg } }
}
