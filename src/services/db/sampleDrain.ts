import type { RingBuffer } from '../../core/ringBuffer'
import type { SampleRepository } from './repositories/sampleRepository'
import type { Sample } from '../../core/types'

/**
 * Wires a RingBuffer to batched SQLite writes on a timer — the drain stage
 * of docs/07-architecture.md "The sample pipeline". This is deliberately
 * minimal for Phase 1: it proves the ring-buffer -> SQLite path end to end.
 * The incremental metrics consumer (docs/07 "Metrics: incremental, then
 * final") is added alongside the metrics engine in Phase 3.
 */
export class SampleDrain {
  private timer: ReturnType<typeof setInterval> | null = null
  /**
   * Guards against overlapping flushes: if a write is slow (or, under fake
   * timers, if several ticks fire before any microtask resolves), a second
   * flush must never start a transaction while the first is still writing —
   * SQLite has no nested transactions, and even if it did, this would
   * reorder writes out of offset order. Each tick chains onto the previous
   * flush's promise instead of firing independently.
   */
  private pendingFlush: Promise<void> = Promise.resolve()

  constructor(
    private readonly buffer: RingBuffer,
    private readonly sampleRepository: SampleRepository,
    private readonly effortId: string,
    private readonly intervalMs = 150,
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      this.pendingFlush = this.pendingFlush.then(() => this.flush())
    }, this.intervalMs)
  }

  /** Stops the timer and performs one final flush so no tail samples are lost. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.pendingFlush = this.pendingFlush.then(() => this.flush())
    await this.pendingFlush
  }

  private async flush(): Promise<void> {
    if (this.buffer.size() === 0) return
    const { forceKg, offsetMs } = this.buffer.drain()
    const samples: Sample[] = forceKg.map((forceKgValue, i) => ({
      effortId: this.effortId,
      offsetMs: offsetMs[i],
      forceKg: forceKgValue,
    }))
    await this.sampleRepository.insertBatch(samples)
  }
}
