import type { DeviceSource, DeviceStatus, Unsubscribe } from './DeviceSource'
import type { RawSample } from '../../core/types'
import { getSequence } from './sequences'
import type { Sequence } from './sequences'

/**
 * Fake device that replays a canned sequence instead of talking BLE — see
 * docs/02-ble-protocol.md "Emulator / test-fixture device". Every phase in
 * docs/08-roadmap.md up to Phase H is built and verified against this, not
 * real hardware.
 *
 * Emits on a timer that mimics real device pacing rather than dumping all
 * points instantly, so downstream code (ring buffer, chart, batched DB
 * writes) is exercised realistically:
 *  - 'batched' sequences (Progressor-like): tick every ~16ms, emitting every
 *    point whose offset has been reached since the last tick — mirrors the
 *    Progressor sending multiple 8-byte samples per BLE notification.
 *  - 'single' sequences (WH-C06-like): tick once per point, at that point's
 *    own spacing — mirrors one weight per advertisement, no batching.
 *
 * NOTE on timers: uses setTimeout/setInterval (not a frame callback) because
 * this stands in for a background BLE thread, not UI — see docs/07
 * "The sample pipeline": the callback that pushes into the ring buffer must
 * not depend on the JS thread being free to render.
 */
export class EmulatorDevice implements DeviceSource {
  readonly kind = 'emulator' as const
  readonly capabilities = {
    hardwareTare: false,
    battery: false,
    requiresConnection: false,
  }

  private readonly sequenceId: string
  private readonly sequence: Sequence
  private connected = false
  private timer: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout> | null = null
  private nextPointIndex = 0
  private startedAtMs = 0
  private tareOffsetKg = 0
  /** How many full loops of a looping sequence have started, so tickBatched can detect a new lap. */
  private lapsEmitted = 0

  private sampleListeners = new Set<(sample: RawSample) => void>()
  private statusListeners = new Set<(status: DeviceStatus) => void>()

  constructor(sequenceId: string) {
    this.sequenceId = sequenceId
    this.sequence = getSequence(sequenceId)
  }

  async connect(): Promise<void> {
    this.emitStatus({ state: 'connecting' })
    this.connected = true
    this.nextPointIndex = 0
    this.lapsEmitted = 0
    this.startedAtMs = Date.now()
    this.emitStatus({ state: 'connected' })
    this.startEmitting()
  }

  async disconnect(): Promise<void> {
    this.stopEmitting()
    this.connected = false
    this.emitStatus({ state: 'disconnected' })
  }

  isConnected(): boolean {
    return this.connected
  }

  onSample(cb: (sample: RawSample) => void): Unsubscribe {
    this.sampleListeners.add(cb)
    return () => this.sampleListeners.delete(cb)
  }

  onStatus(cb: (status: DeviceStatus) => void): Unsubscribe {
    this.statusListeners.add(cb)
    return () => this.statusListeners.delete(cb)
  }

  async tare(): Promise<void> {
    // Software baseline, same as WH-C06 — see docs/02-ble-protocol.md
    // "Command protocol". Subtract the next reading from all future ones.
    const point = this.sequence.points[this.nextPointIndex]
    this.tareOffsetKg = point ? point.forceKg : 0
  }

  /** Which sequence this instance was constructed with — dev UI display only. */
  get sequenceName(): string {
    return this.sequenceId
  }

  private startEmitting(): void {
    if (this.sequence.pacing === 'single') {
      this.scheduleNextSinglePoint()
    } else {
      this.timer = setInterval(() => this.tickBatched(), 16)
    }
  }

  private stopEmitting(): void {
    if (this.timer) {
      clearInterval(this.timer as ReturnType<typeof setInterval>)
      clearTimeout(this.timer as ReturnType<typeof setTimeout>)
      this.timer = null
    }
  }

  private tickBatched(): void {
    const totalMs = this.sequenceDurationMs()
    const rawElapsedMs = Date.now() - this.startedAtMs
    const loop = this.sequence.loop ?? true
    const elapsedMs = loop && totalMs > 0 ? rawElapsedMs % totalMs : rawElapsedMs
    const lapsCompleted = loop && totalMs > 0 ? Math.floor(rawElapsedMs / totalMs) : 0

    // A loop wrap wasn't yet reflected in nextPointIndex (still mid-array
    // from the previous lap) — reset so the "elapsedMs since lap start"
    // comparison below starts scanning from the first point again.
    if (lapsCompleted > this.lapsEmitted) {
      this.nextPointIndex = 0
      this.lapsEmitted = lapsCompleted
    }

    while (
      this.nextPointIndex < this.sequence.points.length &&
      this.sequence.points[this.nextPointIndex].offsetMs <= elapsedMs
    ) {
      const point = this.sequence.points[this.nextPointIndex]
      this.emitPoint(point, this.lapsEmitted * totalMs + point.offsetMs)
      this.nextPointIndex++
    }
    if (!loop && this.nextPointIndex >= this.sequence.points.length) {
      this.onSequenceExhausted()
    }
  }

  private scheduleNextSinglePoint(): void {
    const loop = this.sequence.loop ?? true
    if (this.nextPointIndex >= this.sequence.points.length) {
      if (!loop) {
        this.onSequenceExhausted()
        return
      }
      this.nextPointIndex = 0
      this.lapsEmitted++
    }

    const point = this.sequence.points[this.nextPointIndex]
    if (!point) {
      this.onSequenceExhausted()
      return
    }
    const prevOffsetMs =
      this.nextPointIndex > 0 ? this.sequence.points[this.nextPointIndex - 1].offsetMs : 0
    const delayMs = Math.max(0, point.offsetMs - prevOffsetMs)
    // Keeps deviceTimestampMs monotonically increasing across a loop wrap —
    // a real device's clock never resets, and (effort_id, offset_ms) is a
    // unique DB constraint, so replaying raw in-clip offsets after lap 1
    // would collide.
    const cumulativeOffsetMs = this.lapsEmitted * this.sequenceDurationMs() + point.offsetMs

    this.timer = setTimeout(() => {
      this.emitPoint(point, cumulativeOffsetMs)
      this.nextPointIndex++
      this.scheduleNextSinglePoint()
    }, delayMs)
  }

  private sequenceDurationMs(): number {
    const last = this.sequence.points[this.sequence.points.length - 1]
    return last ? last.offsetMs : 0
  }

  private emitPoint(point: { forceKg: number }, offsetMs: number): void {
    const sample: RawSample = {
      forceKg: point.forceKg - this.tareOffsetKg,
      deviceTimestampMs: offsetMs,
    }
    for (const listener of this.sampleListeners) listener(sample)
  }

  /**
   * The 'dropout' sequence stops here by having no more points — this
   * fires the same disconnected status a real mid-set BLE dropout would,
   * per docs/02-ble-protocol.md, without tearing down connected state the
   * way a deliberate disconnect() call does.
   */
  private onSequenceExhausted(): void {
    this.stopEmitting()
    if (this.sequenceId === 'dropout') {
      this.emitStatus({ state: 'disconnected', reason: 'emulated-dropout' })
    }
  }

  private emitStatus(status: DeviceStatus): void {
    for (const listener of this.statusListeners) listener(status)
  }
}
