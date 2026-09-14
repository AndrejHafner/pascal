import { ConnectionPriority } from 'react-native-ble-plx'
import type { BleManager, Device as BlePlxDevice, Subscription } from 'react-native-ble-plx'
import type { DeviceSource, DeviceStatus, Unsubscribe } from './DeviceSource'
import type { RawSample } from '../../core/types'
import { base64ToBytes, bytesToBase64 } from '../../core/base64'
import { parseProgressorFrame, ProgressorCommand } from './parsers/progressor'

// GATT UUIDs — see docs/02-ble-protocol.md "GATT profile" / "Tindeq Progressor".
const SERVICE_UUID = '7e4e1701-1ea6-40c9-9dcc-13d34ffead57'
const RX_CHARACTERISTIC_UUID = '7e4e1702-1ea6-40c9-9dcc-13d34ffead57'
const TX_CHARACTERISTIC_UUID = '7e4e1703-1ea6-40c9-9dcc-13d34ffead57'

const NAME_PREFIX = 'Progressor'

/**
 * Real Tindeq Progressor implementation over react-native-ble-plx. Standard
 * connect -> discover -> monitor flow, per docs/02-ble-protocol.md
 * "Connection behavior" / "Tindeq Progressor" and
 * docs/07-architecture.md "BLE layer".
 */
export class ProgressorDevice implements DeviceSource {
  readonly kind = 'progressor' as const
  readonly capabilities = {
    hardwareTare: true,
    battery: true,
    requiresConnection: true,
  }

  private device: BlePlxDevice | null = null
  private notifySubscription: Subscription | null = null
  private disconnectSubscription: Subscription | null = null
  private connected = false
  private lastCommand: number | undefined

  private sampleListeners = new Set<(sample: RawSample) => void>()
  private statusListeners = new Set<(status: DeviceStatus) => void>()

  /** deviceId comes from a prior scan (see docs/04 "Connection UX" — remembered device). */
  constructor(
    private readonly manager: BleManager,
    private readonly deviceId: string,
  ) {}

  static nameMatches(name: string | null | undefined): boolean {
    return !!name && name.startsWith(NAME_PREFIX)
  }

  async connect(): Promise<void> {
    this.emitStatus({ state: 'connecting' })

    const device = await this.manager.connectToDevice(this.deviceId)
    await device.discoverAllServicesAndCharacteristics()
    this.device = device

    // Android: push toward a tighter connection interval — per
    // docs/02-ble-protocol.md "Connection behavior" project-wide constraint.
    try {
      await this.manager.requestConnectionPriorityForDevice(this.deviceId, ConnectionPriority.High)
    } catch {
      // iOS has no equivalent API and rejects this — expected, not an error.
    }

    this.disconnectSubscription = this.manager.onDeviceDisconnected(this.deviceId, (error) => {
      this.connected = false
      this.stopNotifications()
      this.emitStatus({
        state: 'disconnected',
        reason: error ? error.message : 'gatt-disconnected',
      })
    })

    this.notifySubscription = this.manager.monitorCharacteristicForDevice(
      this.deviceId,
      SERVICE_UUID,
      RX_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) return
        this.handleNotification(characteristic.value)
      },
    )

    this.connected = true
    this.emitStatus({ state: 'connected' })

    // Streaming does not start automatically — must explicitly write
    // START_WEIGHT_MEAS, per docs/02.
    await this.writeCommand(ProgressorCommand.START_WEIGHT_MEAS)
  }

  async disconnect(): Promise<void> {
    // Best-effort — write STOP_WEIGHT_MEAS before disconnecting cleanly
    // where possible, per docs/02. Not guaranteed on unexpected disconnects,
    // so failures here are swallowed rather than thrown.
    if (this.connected) {
      try {
        await this.writeCommand(ProgressorCommand.STOP_WEIGHT_MEAS)
      } catch {
        // device may already be gone
      }
    }

    this.stopNotifications()
    this.disconnectSubscription?.remove()
    this.disconnectSubscription = null

    try {
      await this.manager.cancelDeviceConnection(this.deviceId)
    } catch {
      // already disconnected
    }

    this.device = null
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

  /** Hardware tare — device must be actively streaming when called, per docs/02. */
  async tare(): Promise<void> {
    await this.writeCommand(ProgressorCommand.TARE_SCALE)
  }

  /**
   * Battery responses arrive asynchronously on the same "rx" notify
   * characteristic as weight samples (kind===0, disambiguated by
   * `lastCommand` in the parser — see docs/02 "kind === 0"), not as a
   * direct return value of the write. pendingBatteryResolve is the bridge
   * from handleNotification back to this pending promise.
   */
  async getBattery(): Promise<number> {
    if (this.pendingBatteryResolve) {
      throw new Error('ProgressorDevice: a getBattery() call is already in flight')
    }

    return new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingBatteryResolve = null
        reject(new Error('Timed out waiting for battery voltage response'))
      }, 5000)

      this.pendingBatteryResolve = (millivolts) => {
        clearTimeout(timeout)
        this.pendingBatteryResolve = null
        resolve(millivolts)
      }

      this.writeCommand(ProgressorCommand.GET_BATTERY_VOLTAGE).catch((err) => {
        clearTimeout(timeout)
        this.pendingBatteryResolve = null
        reject(err)
      })
    })
  }

  private pendingBatteryResolve: ((millivolts: number) => void) | null = null

  private async writeCommand(opcode: number, extraBytes: number[] = []): Promise<void> {
    if (!this.device) throw new Error('ProgressorDevice: not connected')
    this.lastCommand = opcode
    const bytes = new Uint8Array([opcode, ...extraBytes])
    await this.manager.writeCharacteristicWithResponseForDevice(
      this.deviceId,
      SERVICE_UUID,
      TX_CHARACTERISTIC_UUID,
      bytesToBase64(bytes),
    )
  }

  private handleNotification(base64Value: string): void {
    const bytes = base64ToBytes(base64Value)
    const frame = parseProgressorFrame(bytes, this.lastCommand)

    switch (frame.kind) {
      case 'weight_measurement':
        for (const sample of frame.samples) {
          for (const listener of this.sampleListeners) listener(sample)
        }
        break
      case 'battery_voltage_mv':
        this.pendingBatteryResolve?.(frame.millivolts)
        this.pendingBatteryResolve = null
        break
      case 'low_power_warning':
      case 'text':
      case 'progressor_id':
      case 'unsupported':
      case 'malformed':
        // Logged at the call site in dev builds if needed; not a v1
        // concern per docs/02 — these are out of scope for training data.
        break
    }
  }

  private stopNotifications(): void {
    this.notifySubscription?.remove()
    this.notifySubscription = null
  }

  private emitStatus(status: DeviceStatus): void {
    for (const listener of this.statusListeners) listener(status)
  }
}
