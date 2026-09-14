import { RingBuffer } from '../src/core/ringBuffer'

describe('RingBuffer', () => {
  it('drains samples in insertion order', () => {
    const buffer = new RingBuffer(8)
    buffer.push(10, 0)
    buffer.push(20, 16)
    buffer.push(30, 32)

    const { forceKg, offsetMs } = buffer.drain()
    expect(forceKg).toEqual([10, 20, 30])
    expect(offsetMs).toEqual([0, 16, 32])
  })

  it('is empty after draining', () => {
    const buffer = new RingBuffer(8)
    buffer.push(1, 0)
    buffer.drain()
    expect(buffer.size()).toBe(0)
    expect(buffer.drain().forceKg).toEqual([])
  })

  it('wraps correctly when writes exceed capacity between drains', () => {
    const buffer = new RingBuffer(4)
    for (let i = 0; i < 4; i++) buffer.push(i, i * 10)

    const { forceKg, offsetMs } = buffer.drain()
    expect(forceKg).toEqual([0, 1, 2, 3])
    expect(offsetMs).toEqual([0, 10, 20, 30])
  })

  it('keeps only the most recent `capacity` samples when overrun between drains', () => {
    const buffer = new RingBuffer(4)
    // Push 6 samples into a 4-slot buffer without draining in between —
    // simulates the drain timer being starved, which docs/07-architecture.md
    // flags as an open question (overflow behavior). Current behavior: the
    // oldest samples are silently overwritten, newest 4 survive.
    for (let i = 0; i < 6; i++) buffer.push(i, i * 10)

    const { forceKg } = buffer.drain()
    expect(forceKg).toEqual([2, 3, 4, 5])
  })

  it('supports multiple push/drain cycles (simulating repeated timer ticks)', () => {
    const buffer = new RingBuffer(4)
    buffer.push(1, 0)
    buffer.push(2, 16)
    expect(buffer.drain().forceKg).toEqual([1, 2])

    buffer.push(3, 32)
    expect(buffer.drain().forceKg).toEqual([3])

    expect(buffer.drain().forceKg).toEqual([])
  })
})
