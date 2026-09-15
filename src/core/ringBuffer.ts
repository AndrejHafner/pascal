// Preallocated, fixed-size ring buffer for incoming force samples — see
// docs/07-architecture.md "The sample pipeline". The BLE callback (or the
// emulator, which stands in for it) does exactly one thing on the hot path:
// push a decoded sample here. No allocation per sample, so no GC pauses
// mid-set. A drain timer elsewhere reads out what's accumulated since the
// last drain and clears it.

export class RingBuffer {
  private readonly forceKg: Float32Array
  private readonly offsetMs: Uint32Array
  private readonly capacity: number
  private writeIndex = 0
  private count = 0

  /** capacity defaults to ~68s of headroom at 60Hz — see docs/07. */
  constructor(capacity = 4096) {
    this.capacity = capacity
    this.forceKg = new Float32Array(capacity)
    this.offsetMs = new Uint32Array(capacity)
  }

  push(forceKgValue: number, offsetMsValue: number): void {
    this.forceKg[this.writeIndex] = forceKgValue
    this.offsetMs[this.writeIndex] = offsetMsValue
    this.writeIndex = (this.writeIndex + 1) % this.capacity
    this.count = Math.min(this.count + 1, this.capacity)
  }

  /** Number of samples currently held (since last drain), capped at capacity. */
  size(): number {
    return this.count
  }

  /**
   * Copies out everything currently buffered, oldest first, and clears the
   * buffer. Called by the drain timer (~150ms) — see docs/07-architecture.md.
   */
  drain(): { forceKg: number[]; offsetMs: number[] } {
    const n = this.count
    const forceKgOut = new Array<number>(n)
    const offsetMsOut = new Array<number>(n)

    const startIndex = (this.writeIndex - n + this.capacity) % this.capacity
    for (let i = 0; i < n; i++) {
      const idx = (startIndex + i) % this.capacity
      forceKgOut[i] = this.forceKg[idx]
      offsetMsOut[i] = this.offsetMs[idx]
    }

    this.count = 0
    return { forceKg: forceKgOut, offsetMs: offsetMsOut }
  }

  clear(): void {
    this.count = 0
    this.writeIndex = 0
  }

  /**
   * Non-destructive read of the most recent `maxSamples` (or all buffered,
   * if fewer), oldest first, WITHOUT clearing the buffer. For the chart's
   * per-frame read — see docs/07-architecture.md "Charts": "Live: reads
   * the ring buffer on a [per-frame] loop... never re-renders via React
   * state." Writing into these output arrays (rather than allocating new
   * ones) lets a caller reuse fixed-size buffers across frames to avoid
   * per-frame GC pressure, matching the same no-allocation-on-the-hot-path
   * principle push() follows.
   */
  peekLatest(
    maxSamples: number,
    outForceKg?: Float32Array,
    outOffsetMs?: Uint32Array,
  ): { forceKg: Float32Array; offsetMs: Uint32Array; length: number } {
    const n = Math.min(this.count, maxSamples, outForceKg?.length ?? Infinity)
    const forceKgOut = outForceKg ?? new Float32Array(maxSamples)
    const offsetMsOut = outOffsetMs ?? new Uint32Array(maxSamples)

    const startIndex = (this.writeIndex - n + this.capacity) % this.capacity
    for (let i = 0; i < n; i++) {
      const idx = (startIndex + i) % this.capacity
      forceKgOut[i] = this.forceKg[idx]
      offsetMsOut[i] = this.offsetMs[idx]
    }

    return { forceKg: forceKgOut, offsetMs: offsetMsOut, length: n }
  }
}
