// Dependency-free base64 <-> Uint8Array codec. react-native-ble-plx hands
// characteristic/manufacturer-data values as base64 strings; parsers need
// raw bytes. Deliberately not relying on `atob`/`Buffer` globals — both
// exist under Node/Jest but atob's availability on Hermes varies by RN
// version, and this keeps src/core/ (see docs/07-architecture.md
// "Layering") free of any runtime assumption beyond plain JS.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const CHAR_TO_INDEX: Record<string, number> = {}
for (let i = 0; i < ALPHABET.length; i++) CHAR_TO_INDEX[ALPHABET[i]] = i

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/=+$/, '')
  const bytes: number[] = []

  let buffer = 0
  let bitsCollected = 0
  for (const char of clean) {
    const value = CHAR_TO_INDEX[char]
    if (value === undefined) continue // ignore whitespace/newlines
    buffer = (buffer << 6) | value
    bitsCollected += 6
    if (bitsCollected >= 8) {
      bitsCollected -= 8
      bytes.push((buffer >> bitsCollected) & 0xff)
    }
  }

  return new Uint8Array(bytes)
}

export function bytesToBase64(bytes: Uint8Array): string {
  let result = ''
  let buffer = 0
  let bitsCollected = 0

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bitsCollected += 8
    while (bitsCollected >= 6) {
      bitsCollected -= 6
      result += ALPHABET[(buffer >> bitsCollected) & 0x3f]
    }
  }

  if (bitsCollected > 0) {
    result += ALPHABET[(buffer << (6 - bitsCollected)) & 0x3f]
  }

  while (result.length % 4 !== 0) result += '='
  return result
}
