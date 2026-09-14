import type { RawSample } from '../../core/types'

export type Unsubscribe = () => void

export type DeviceStatus =
  { state: 'connecting' } | { state: 'connected' } | { state: 'disconnected'; reason?: string }

/**
 * The interface every device — real or emulated — implements. Per
 * docs/02-ble-protocol.md "Emulator / test-fixture device" and
 * docs/07-architecture.md "BLE layer": the rest of the app (live session,
 * recorder) talks only to this, never to react-native-ble-plx or the
 * emulator's timer directly.
 */
export interface DeviceSource {
  readonly kind: 'progressor' | 'whc06' | 'emulator'
  readonly capabilities: {
    /** Progressor: yes (hardware tare). WH-C06: no (software baseline only). */
    hardwareTare: boolean
    /** Progressor: yes. WH-C06: no battery characteristic at all. */
    battery: boolean
    /** WH-C06 is advertisement-only — no GATT connection for data. */
    requiresConnection: boolean
  }

  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean

  onSample(cb: (sample: RawSample) => void): Unsubscribe
  onStatus(cb: (status: DeviceStatus) => void): Unsubscribe

  tare(): Promise<void>
  /** Present only on devices with capabilities.battery === true. */
  getBattery?(): Promise<number>
}
