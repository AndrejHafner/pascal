import type { BleManager, Device as BlePlxDevice } from 'react-native-ble-plx'
import type { DeviceSource, DeviceStatus, Unsubscribe } from './DeviceSource'
import type { RawSample } from '../../core/types'
import { base64ToBytes } from '../../core/base64'
import { parseWhc06Advertisement, WHC06_MANUFACTURER_ID } from './parsers/whc06'

const ADVERTISEMENT_TIMEOUT_MS = 10_000

/**
 * Real Weiheng WH-C06 implementation over react-native-ble-plx. Scan-and-
 * listen, NOT connect-and-monitor — see docs/02-ble-protocol.md "Connection
 * behavior" / "Weiheng WH-C06": this device has no GATT service at all,
 * data arrives inside BLE advertisement manufacturer-data packets.
 *
 * Software-only tare (no hardware tare characteristic exists on this
 * device) and a 10s no-advertisement watchdog standing in for a
 * "disconnect" — both per docs/02.
 */
export class WHC06Device implements DeviceSource {
  readonly kind = 'whc06' as const
  readonly capabilities = {
    hardwareTare: false,
    battery: false,
    requiresConnection: false,
  }

  private scanning = false
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null
  private tareOffsetKg = 0
  /**
   * Software tare, per docs/02-ble-protocol.md "Command protocol" /
   * "Weiheng WH-C06": tare must subtract a captured baseline from
   * *subsequent* readings after the user explicitly calls tare() — it is
   * NOT automatic on the first-ever sample. Before any tare() call, raw
   * device readings pass through unmodified.
   */
  private tarePending = false

  private sampleListeners = new Set<(sample: RawSample) => void>()
  private statusListeners = new Set<(status: DeviceStatus) => void>()

  constructor(private readonly manager: BleManager) {}

  async connect(): Promise<void> {
    this.emitStatus({ state: 'connecting' })

    // allowDuplicates: WH-C06 broadcasts continuously and every advertisement
    // is a new weight reading — without this, the OS-level scan dedup would
    // deliver only the first sighting per scan cycle, not a live stream.
    // iOS-only per the ble-plx types; harmless no-op on Android where scan
    // results are already delivered per-advertisement.
    await this.manager.startDeviceScan(null, { allowDuplicates: true }, (error, device) => {
      if (error) {
        this.emitStatus({ state: 'disconnected', reason: error.message })
        return
      }
      if (!device) return
      this.handleScanResult(device)
    })

    this.scanning = true
    this.resetWatchdog()
    this.emitStatus({ state: 'connected' })
  }

  async disconnect(): Promise<void> {
    this.clearWatchdog()
    if (this.scanning) {
      await this.manager.stopDeviceScan()
      this.scanning = false
    }
    this.emitStatus({ state: 'disconnected' })
  }

  isConnected(): boolean {
    // No real GATT session for data — "connected" means "actively
    // scanning", per docs/02 "isConnected() is also overridden" guidance
    // (mirrored from Grip Connect's own WH-C06 handling).
    return this.scanning
  }

  onSample(cb: (sample: RawSample) => void): Unsubscribe {
    this.sampleListeners.add(cb)
    return () => this.sampleListeners.delete(cb)
  }

  onStatus(cb: (status: DeviceStatus) => void): Unsubscribe {
    this.statusListeners.add(cb)
    return () => this.statusListeners.delete(cb)
  }

  /** Software baseline — no hardware tare exists on this device, per docs/02. */
  async tare(): Promise<void> {
    this.tarePending = true // the *next* sample becomes the new zero baseline
  }

  /**
   * ASSUMPTION, NOT YET HARDWARE-VERIFIED (flag for Phase H — see
   * docs/08-roadmap.md "Phase H"): react-native-ble-plx's
   * `Device.manufacturerData` field is documented only as "format defined
   * by manufacturer," so whether it includes the 2-byte company-identifier
   * prefix (as the raw Bluetooth manufacturer-data AD structure does) or
   * has already been stripped by the native layer is unconfirmed. This
   * assumes the prefix IS present — little-endian company id at offsets
   * 0-1, payload (where docs/02's offset 10-11 weight field lives) starting
   * at offset 2 — matching the raw AD structure and Grip Connect's own
   * handling. If real scanning shows the weight bytes 2 positions off from
   * what docs/02 predicts, this stripping step is the first place to check.
   */
  private handleScanResult(device: BlePlxDevice): void {
    if (!device.manufacturerData) return

    const bytes = base64ToBytes(device.manufacturerData)
    if (bytes.length < 2) return

    const companyId = bytes[0] | (bytes[1] << 8)
    if (companyId !== WHC06_MANUFACTURER_ID) return

    const payload = bytes.subarray(2)
    const result = parseWhc06Advertisement(payload)
    if (!result.ok) return

    this.resetWatchdog()

    let forceKg = result.sample.forceKg
    if (this.tarePending) {
      this.tareOffsetKg = forceKg
      this.tarePending = false
    }
    forceKg -= this.tareOffsetKg

    const sample: RawSample = { forceKg }
    for (const listener of this.sampleListeners) listener(sample)
  }

  /**
   * Treats "no advertisement for 10s" as equivalent to a disconnect,
   * mirroring Grip Connect's own watchdog — per docs/02. Because there's no
   * persistent connection, recovery is just "keep scanning, resume when an
   * advertisement reappears" — no explicit reconnect call needed.
   */
  private resetWatchdog(): void {
    this.clearWatchdog()
    this.watchdogTimer = setTimeout(() => {
      this.emitStatus({ state: 'disconnected', reason: 'advertisement-timeout' })
    }, ADVERTISEMENT_TIMEOUT_MS)
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer)
      this.watchdogTimer = null
    }
  }

  private emitStatus(status: DeviceStatus): void {
    for (const listener of this.statusListeners) listener(status)
  }
}
