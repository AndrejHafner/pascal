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
    const elapsedMs = Date.now() - this.startedAtMs
    while (
      this.nextPointIndex < this.sequence.points.length &&
      this.sequence.points[this.nextPointIndex].offsetMs <= elapsedMs
    ) {
      this.emitPoint(this.sequence.points[this.nextPointIndex])
      this.nextPointIndex++
    }
    if (this.nextPointIndex >= this.sequence.points.length) {
      this.onSequenceExhausted()
    }
  }

  private scheduleNextSinglePoint(): void {
    const point = this.sequence.points[this.nextPointIndex]
    if (!point) {
      this.onSequenceExhausted()
      return
    }
    const prevOffsetMs =
      this.nextPointIndex > 0 ? this.sequence.points[this.nextPointIndex - 1].offsetMs : 0
    const delayMs = Math.max(0, point.offsetMs - prevOffsetMs)

    this.timer = setTimeout(() => {
      this.emitPoint(point)
      this.nextPointIndex++
      this.scheduleNextSinglePoint()
    }, delayMs)
  }

  private emitPoint(point: { forceKg: number; offsetMs: number }): void {
    const sample: RawSample = {
      forceKg: point.forceKg - this.tareOffsetKg,
      deviceTimestampMs: point.offsetMs,
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
