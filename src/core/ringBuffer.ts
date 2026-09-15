// Preallocated, fixed-size ring buffer for incoming force samples — see
// docs/07-architecture.md "The sample pipeline". The BLE callback (or the
// emulator, which stands in for it) does exactly one thing on the hot path:
// push a decoded sample here. No allocation per sample, so no GC pauses
// mid-set.
//
// Two independent consumers read this buffer with very different needs:
//  - SampleDrain persists whatever is new since its last flush, on a ~150ms
//    timer, and must never see the same sample twice.
//  - ForceChart peeks the last ~10s of samples every animation frame for
//    the live trailing-window plot, and must never have that window yanked
//    out from under it by an unrelated consumer.
// Earlier, drain() cleared the shared buffer on every flush, so the chart's
// "last 10 seconds" read was actually bounded by "whatever accumulated in
// the last ~150ms since the last drain tick" — the trace was visible only
// as a few points hugging the right edge. push() now advances a
// monotonically increasing total counter that read/peek is always relative
// to; nothing destructive happens on it. Persistence tracks its own
// `drainedUpTo` cursor instead of mutating shared buffer state.
export class RingBuffer {
  private readonly forceKg: Float32Array
  private readonly offsetMs: Uint32Array
  private readonly capacity: number
  private writeIndex = 0
  /** Total samples ever pushed — never decreases, never reset by a read. */
  private totalPushed = 0
  /** How many of totalPushed have been handed out by drainSince(). */
  private drainedUpTo = 0

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
    this.totalPushed++
  }

  /** Number of samples currently held in the window (capped at capacity). */
  size(): number {
    return Math.min(this.totalPushed, this.capacity)
  }

  /**
   * Copies out every sample pushed since the last drainSince() call (or
   * since construction), oldest first, up to `capacity` of them if the
   * drain timer fell far enough behind to lose the oldest ones. Advances
   * the drain cursor but never touches the rolling window itself — a
   * concurrent peekLatest() (the live chart) is unaffected.
   */
  drainSince(): { forceKg: number[]; offsetMs: number[] } {
    const undrained = this.totalPushed - this.drainedUpTo
    const n = Math.min(undrained, this.capacity)
    const forceKgOut = new Array<number>(n)
    const offsetMsOut = new Array<number>(n)

    const startIndex = (this.writeIndex - n + this.capacity) % this.capacity
    for (let i = 0; i < n; i++) {
      const idx = (startIndex + i) % this.capacity
      forceKgOut[i] = this.forceKg[idx]
      offsetMsOut[i] = this.offsetMs[idx]
    }

    this.drainedUpTo = this.totalPushed
    return { forceKg: forceKgOut, offsetMs: offsetMsOut }
  }

  clear(): void {
    this.totalPushed = 0
    this.drainedUpTo = 0
    this.writeIndex = 0
  }

  /**
   * Non-destructive read of the most recent `maxSamples` (or all buffered,
   * if fewer) from the rolling window, oldest first. Independent of
   * drainSince() — for the chart's per-frame read, see
   * docs/07-architecture.md "Charts": "Live: reads the ring buffer on a
   * [per-frame] loop... never re-renders via React state." Writing into
   * these output arrays (rather than allocating new ones) lets a caller
   * reuse fixed-size buffers across frames to avoid per-frame GC pressure,
   * matching the same no-allocation-on-the-hot-path principle push()
   * follows.
   */
  peekLatest(
    maxSamples: number,
    outForceKg?: Float32Array,
    outOffsetMs?: Uint32Array,
  ): { forceKg: Float32Array; offsetMs: Uint32Array; length: number } {
    const available = Math.min(this.totalPushed, this.capacity)
    const n = Math.min(available, maxSamples, outForceKg?.length ?? Infinity)
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
