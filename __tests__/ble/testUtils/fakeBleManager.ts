import { bytesToBase64 } from '../../../src/core/base64'

/**
 * Fake BleManager covering exactly the surface ProgressorDevice and
 * WHC06Device call — see the real BleManager can't be constructed under
 * Jest at all (`new NativeEventEmitter()` requires a native module, which
 * doesn't exist in this environment). Deliberately not a full mock of
 * react-native-ble-plx; both device classes take their manager as a
 * constructor parameter specifically so a narrow fake like this is
 * possible — see docs/07-architecture.md "BLE layer".
 *
 * Test-only — never imported from src/.
 */

type NotifyListener = (error: Error | null, characteristic: { value: string } | null) => void
type DisconnectListener = (error: Error | null, device: unknown) => void
type ScanListener = (
  error: Error | null,
  device: { id: string; name: string | null; manufacturerData: string | null } | null,
) => void

export class FakeBleManager {
  connectToDeviceCalls: string[] = []
  writeCalls: { serviceUUID: string; characteristicUUID: string; base64Value: string }[] = []
  requestConnectionPriorityCalls: unknown[] = []
  cancelDeviceConnectionCalls: string[] = []
  stopDeviceScanCalled = false

  private notifyListener: NotifyListener | null = null
  private disconnectListener: DisconnectListener | null = null
  private scanListener: ScanListener | null = null

  connectToDevice = jest.fn(async (deviceId: string) => {
    this.connectToDeviceCalls.push(deviceId)
    return {
      id: deviceId,
      discoverAllServicesAndCharacteristics: jest.fn(async () => undefined),
    }
  })

  requestConnectionPriorityForDevice = jest.fn(async (...args: unknown[]) => {
    this.requestConnectionPriorityCalls.push(args)
    return {}
  })

  onDeviceDisconnected = jest.fn((_deviceId: string, listener: DisconnectListener) => {
    this.disconnectListener = listener
    return { remove: jest.fn() }
  })

  monitorCharacteristicForDevice = jest.fn(
    (
      _deviceId: string,
      _serviceUUID: string,
      _characteristicUUID: string,
      listener: NotifyListener,
    ) => {
      this.notifyListener = listener
      return { remove: jest.fn() }
    },
  )

  writeCharacteristicWithResponseForDevice = jest.fn(
    async (
      _deviceId: string,
      serviceUUID: string,
      characteristicUUID: string,
      base64Value: string,
    ) => {
      this.writeCalls.push({ serviceUUID, characteristicUUID, base64Value })
      return {}
    },
  )

  cancelDeviceConnection = jest.fn(async (deviceId: string) => {
    this.cancelDeviceConnectionCalls.push(deviceId)
    return {}
  })

  startDeviceScan = jest.fn(
    async (_uuids: string[] | null, _options: unknown, listener: ScanListener) => {
      this.scanListener = listener
    },
  )

  stopDeviceScan = jest.fn(async () => {
    this.stopDeviceScanCalled = true
  })

  // --- test-driving helpers, not part of the real BleManager API ---

  /** Simulates a notification arriving on the monitored characteristic. */
  emitNotification(bytes: Uint8Array): void {
    this.notifyListener?.(null, { value: bytesToBase64(bytes) })
  }

  /** Simulates the OS reporting a GATT disconnect. */
  emitDisconnect(error: Error | null = null): void {
    this.disconnectListener?.(error, null)
  }

  /** Simulates a scan result — manufacturerDataBytes is the raw AD payload, base64-encoded here. */
  emitScanResult(id: string, name: string | null, manufacturerDataBytes: Uint8Array | null): void {
    this.scanListener?.(null, {
      id,
      name,
      manufacturerData: manufacturerDataBytes ? bytesToBase64(manufacturerDataBytes) : null,
    })
  }

  emitScanError(error: Error): void {
    this.scanListener?.(error, null)
  }
}
