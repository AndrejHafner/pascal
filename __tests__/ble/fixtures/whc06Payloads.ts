// Hand-constructed WH-C06 manufacturer-data payloads matching the byte
// layout in docs/02-ble-protocol.md exactly: offset 10-11 = uint16 BE
// weight, /100 -> kg.

export function weightPayload(weightKgTimes100: number, totalLength = 16): Uint8Array {
  const bytes = new Uint8Array(totalLength)
  bytes[10] = (weightKgTimes100 >> 8) & 0xff
  bytes[11] = weightKgTimes100 & 0xff
  return bytes
}
