import type {
  DeviceSource,
  DeviceStatus,
  Unsubscribe,
} from '../../../src/services/ble/DeviceSource'
import type { RawSample } from '../../../src/core/types'

/**
 * Minimal controllable DeviceSource for testing useSessionRunner — lets a
 * test push samples and status changes on demand without any real BLE or
 * emulator timing involved. Test-only.
 */
export class FakeDeviceSource implements DeviceSource {
  readonly kind = 'emulator' as const
  readonly capabilities = { hardwareTare: false, battery: false, requiresConnection: false }

  private sampleListeners = new Set<(sample: RawSample) => void>()
  private statusListeners = new Set<(status: DeviceStatus) => void>()
  private connected = false

  async connect(): Promise<void> {
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.connected = false
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

  async tare(): Promise<void> {}

  emitSample(forceKg: number): void {
    for (const listener of this.sampleListeners) listener({ forceKg })
  }

  emitStatus(status: DeviceStatus): void {
    for (const listener of this.statusListeners) listener(status)
  }
}
