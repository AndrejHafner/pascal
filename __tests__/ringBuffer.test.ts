import { RingBuffer } from '../src/core/ringBuffer'

describe('RingBuffer.drainSince — persistence cursor', () => {
  it('drains samples in insertion order', () => {
    const buffer = new RingBuffer(8)
    buffer.push(10, 0)
    buffer.push(20, 16)
    buffer.push(30, 32)

    const { forceKg, offsetMs } = buffer.drainSince()
    expect(forceKg).toEqual([10, 20, 30])
    expect(offsetMs).toEqual([0, 16, 32])
  })

  it('returns nothing new immediately after draining', () => {
    const buffer = new RingBuffer(8)
    buffer.push(1, 0)
    buffer.drainSince()
    expect(buffer.drainSince().forceKg).toEqual([])
  })

  it('wraps correctly when writes exceed capacity between drains', () => {
    const buffer = new RingBuffer(4)
    for (let i = 0; i < 4; i++) buffer.push(i, i * 10)

    const { forceKg, offsetMs } = buffer.drainSince()
    expect(forceKg).toEqual([0, 1, 2, 3])
    expect(offsetMs).toEqual([0, 10, 20, 30])
  })

  it('keeps only the most recent `capacity` samples when overrun between drains', () => {
    const buffer = new RingBuffer(4)
    // Push 6 samples into a 4-slot buffer without draining in between —
    // simulates the drain timer being starved, which docs/07-architecture.md
    // flags as an open question (overflow behavior). Current behavior: the
    // oldest samples are silently lost, newest 4 survive.
    for (let i = 0; i < 6; i++) buffer.push(i, i * 10)

    const { forceKg } = buffer.drainSince()
    expect(forceKg).toEqual([2, 3, 4, 5])
  })

  it('supports multiple push/drain cycles (simulating repeated timer ticks)', () => {
    const buffer = new RingBuffer(4)
    buffer.push(1, 0)
    buffer.push(2, 16)
    expect(buffer.drainSince().forceKg).toEqual([1, 2])

    buffer.push(3, 32)
    expect(buffer.drainSince().forceKg).toEqual([3])

    expect(buffer.drainSince().forceKg).toEqual([])
  })
})

describe('RingBuffer.peekLatest — non-destructive read for the chart frame loop', () => {
  it('returns the most recent samples without clearing the buffer', () => {
    const buffer = new RingBuffer(8)
    buffer.push(10, 0)
    buffer.push(20, 16)
    buffer.push(30, 32)

    const first = buffer.peekLatest(10)
    expect(Array.from(first.forceKg.slice(0, first.length))).toEqual([10, 20, 30])
    expect(buffer.size()).toBe(3) // unchanged — not destructive

    const second = buffer.peekLatest(10)
    expect(Array.from(second.forceKg.slice(0, second.length))).toEqual([10, 20, 30])
  })

  it('caps output at maxSamples, keeping only the most recent ones', () => {
    const buffer = new RingBuffer(8)
    for (let i = 0; i < 5; i++) buffer.push(i, i * 10)

    const result = buffer.peekLatest(3)
    expect(result.length).toBe(3)
    expect(Array.from(result.forceKg.slice(0, 3))).toEqual([2, 3, 4])
  })

  it('reuses caller-supplied output arrays instead of allocating new ones', () => {
    const buffer = new RingBuffer(8)
    buffer.push(5, 0)
    buffer.push(6, 16)

    const outForce = new Float32Array(4)
    const outOffset = new Uint32Array(4)
    const result = buffer.peekLatest(4, outForce, outOffset)

    expect(result.forceKg).toBe(outForce) // same identity, not a fresh array
    expect(result.offsetMs).toBe(outOffset)
    expect(result.length).toBe(2)
  })

  it('handles peeking an empty buffer', () => {
    const buffer = new RingBuffer(8)
    const result = buffer.peekLatest(10)
    expect(result.length).toBe(0)
  })

  it('works correctly after the buffer has wrapped around', () => {
    const buffer = new RingBuffer(4)
    for (let i = 0; i < 6; i++) buffer.push(i, i * 10) // wraps; 2,3,4,5 survive

    const result = buffer.peekLatest(10)
    expect(Array.from(result.forceKg.slice(0, result.length))).toEqual([2, 3, 4, 5])
  })
})

describe('RingBuffer — drainSince() and peekLatest() are independent', () => {
  // This is the regression test for the actual live-session bug: the chart
  // (peekLatest, every animation frame) and SampleDrain (drainSince, every
  // ~150ms) read the SAME RingBuffer instance concurrently. The old
  // drain() cleared shared buffer state on every flush, so peekLatest()
  // never saw more than ~150ms of history — the live trace was reduced to
  // a few points hugging the right edge of the chart instead of the
  // intended 10s trailing window.
  it('draining does not shrink what peekLatest can see', () => {
    const buffer = new RingBuffer(64)
    for (let i = 0; i < 10; i++) buffer.push(i, i * 16)

    const beforeDrain = buffer.peekLatest(64)
    expect(beforeDrain.length).toBe(10)

    buffer.drainSince() // simulates a SampleDrain flush tick

    const afterDrain = buffer.peekLatest(64)
    expect(afterDrain.length).toBe(10)
    expect(Array.from(afterDrain.forceKg.slice(0, 10))).toEqual(
      Array.from(beforeDrain.forceKg.slice(0, 10)),
    )
  })

  it('the rolling window keeps growing across many drain cycles, not resetting each time', () => {
    const buffer = new RingBuffer(64)

    // Simulate ~1.5s of samples at 60Hz with a drain tick every ~150ms (9
    // samples), like the real pipeline: push some, drain, repeat.
    let pushed = 0
    for (let tick = 0; tick < 10; tick++) {
      for (let i = 0; i < 9; i++) {
        buffer.push(pushed, pushed * 16)
        pushed++
      }
      buffer.drainSince()
      const window = buffer.peekLatest(64)
      // The window should reflect everything pushed so far (up to
      // capacity), not just the last drain tick's 9 samples.
      expect(window.length).toBe(Math.min(pushed, 64))
    }
  })

  it('drainSince still hands every sample to persistence exactly once, undisturbed by peeking', () => {
    const buffer = new RingBuffer(64)
    const allDrained: number[] = []

    for (let tick = 0; tick < 5; tick++) {
      for (let i = 0; i < 4; i++) buffer.push(tick * 4 + i, (tick * 4 + i) * 16)
      buffer.peekLatest(64) // the chart reading concurrently must not affect drain
      const { forceKg } = buffer.drainSince()
      allDrained.push(...forceKg)
    }

    expect(allDrained).toEqual(Array.from({ length: 20 }, (_, i) => i))
  })
})
