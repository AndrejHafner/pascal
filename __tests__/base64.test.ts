import { base64ToBytes, bytesToBase64 } from '../src/core/base64'

describe('base64 codec', () => {
  it('round-trips arbitrary byte sequences', () => {
    const original = new Uint8Array([0, 1, 2, 254, 255, 128, 42, 7])
    const encoded = bytesToBase64(original)
    const decoded = base64ToBytes(encoded)
    expect(Array.from(decoded)).toEqual(Array.from(original))
  })

  it('round-trips a Progressor-shaped 8-byte sample (float32 + uint32)', () => {
    const bytes = new Uint8Array(8)
    const view = new DataView(bytes.buffer)
    view.setFloat32(0, 23.45, true)
    view.setUint32(4, 1_000_000, true)

    const decoded = base64ToBytes(bytesToBase64(bytes))
    const decodedView = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength)
    expect(decodedView.getFloat32(0, true)).toBeCloseTo(23.45, 4)
    expect(decodedView.getUint32(4, true)).toBe(1_000_000)
  })

  it('matches a known base64 test vector ("Man" -> "TWFu")', () => {
    const bytes = new Uint8Array([0x4d, 0x61, 0x6e]) // "Man"
    expect(bytesToBase64(bytes)).toBe('TWFu')
    expect(Array.from(base64ToBytes('TWFu'))).toEqual([0x4d, 0x61, 0x6e])
  })

  it('handles empty input', () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe('')
    expect(base64ToBytes('').length).toBe(0)
  })

  it('handles input requiring padding (non-multiple-of-3 byte length)', () => {
    const oneByte = new Uint8Array([0xff])
    expect(base64ToBytes(bytesToBase64(oneByte))).toEqual(oneByte)

    const twoBytes = new Uint8Array([0xff, 0x00])
    expect(Array.from(base64ToBytes(bytesToBase64(twoBytes)))).toEqual(Array.from(twoBytes))
  })
})
