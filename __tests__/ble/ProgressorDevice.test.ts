import { ProgressorDevice } from '../../src/services/ble/ProgressorDevice'
import { FakeBleManager } from './testUtils/fakeBleManager'
import { weightMeasurementPacket, batteryVoltageResponsePacket } from './fixtures/progressorPackets'
import type { DeviceStatus } from '../../src/services/ble/DeviceSource'

const SERVICE_UUID = '7e4e1701-1ea6-40c9-9dcc-13d34ffead57'
const TX_CHARACTERISTIC_UUID = '7e4e1703-1ea6-40c9-9dcc-13d34ffead57'

describe('ProgressorDevice', () => {
  it('reports the correct kind and capabilities', () => {
    const manager = new FakeBleManager()
    const device = new ProgressorDevice(manager as never, 'device-1')
    expect(device.kind).toBe('progressor')
    expect(device.capabilities).toEqual({
      hardwareTare: true,
      battery: true,
      requiresConnection: true,
    })
  })

  it('connects, discovers services, and writes START_WEIGHT_MEAS', async () => {
    const manager = new FakeBleManager()
    const device = new ProgressorDevice(manager as never, 'device-1')

    await device.connect()

    expect(manager.connectToDeviceCalls).toEqual(['device-1'])
    expect(device.isConnected()).toBe(true)

    const startWrite = manager.writeCalls.find(
      (w) => w.characteristicUUID === TX_CHARACTERISTIC_UUID,
    )
    expect(startWrite).toBeDefined()
    // 0x65 = START_WEIGHT_MEAS, base64-encoded single byte
    expect(startWrite?.base64Value).toBe('ZQ==')
  })

  it('emits connecting then connected status in order', async () => {
    const manager = new FakeBleManager()
    const device = new ProgressorDevice(manager as never, 'device-1')
    const statuses: DeviceStatus[] = []
    device.onStatus((s) => statuses.push(s))

    await device.connect()

    expect(statuses[0]).toEqual({ state: 'connecting' })
    expect(statuses[1]).toEqual({ state: 'connected' })
  })

  it('parses an incoming notification into a RawSample and forwards it', async () => {
    const manager = new FakeBleManager()
    const device = new ProgressorDevice(manager as never, 'device-1')
    const samples: number[] = []
    device.onSample((s) => samples.push(s.forceKg))

    await device.connect()
    manager.emitNotification(weightMeasurementPacket([{ weightKg: 27.5, timestampUs: 0 }]))

    expect(samples).toHaveLength(1)
    expect(samples[0]).toBeCloseTo(27.5, 4)
  })

  it('forwards every sample from a batched notification', async () => {
    const manager = new FakeBleManager()
    const device = new ProgressorDevice(manager as never, 'device-1')
    const samples: number[] = []
    device.onSample((s) => samples.push(s.forceKg))

    await device.connect()
    manager.emitNotification(
      weightMeasurementPacket([
        { weightKg: 10, timestampUs: 0 },
        { weightKg: 20, timestampUs: 16_667 },
      ]),
    )

    expect(samples).toEqual([10, 20])
  })

  it('tare() writes TARE_SCALE (0x64) to the tx characteristic', async () => {
    const manager = new FakeBleManager()
    const device = new ProgressorDevice(manager as never, 'device-1')
    await device.connect()
    manager.writeCalls.length = 0 // clear the START_WEIGHT_MEAS write from connect()

    await device.tare()

    expect(manager.writeCalls).toHaveLength(1)
    expect(manager.writeCalls[0].serviceUUID).toBe(SERVICE_UUID)
    expect(manager.writeCalls[0].base64Value).toBe('ZA==') // 0x64
  })

  it('getBattery() resolves from the async command-response notification, not the write call', async () => {
    const manager = new FakeBleManager()
    const device = new ProgressorDevice(manager as never, 'device-1')
    await device.connect()

    const batteryPromise = device.getBattery()
    // Response arrives asynchronously on the notify characteristic, not as
    // the write's return value — see docs/02 "kind === 0".
    manager.emitNotification(batteryVoltageResponsePacket(4055))

    await expect(batteryPromise).resolves.toBe(4055)
  })

  it('a mid-session GATT disconnect surfaces as a disconnected status, not silence', async () => {
    const manager = new FakeBleManager()
    const device = new ProgressorDevice(manager as never, 'device-1')
    const statuses: DeviceStatus[] = []
    device.onStatus((s) => statuses.push(s))

    await device.connect()
    manager.emitDisconnect(new Error('link loss'))

    const last = statuses[statuses.length - 1]
    expect(last.state).toBe('disconnected')
    expect(device.isConnected()).toBe(false)
  })

  it('disconnect() writes STOP_WEIGHT_MEAS before tearing down the connection', async () => {
    const manager = new FakeBleManager()
    const device = new ProgressorDevice(manager as never, 'device-1')
    await device.connect()
    manager.writeCalls.length = 0

    await device.disconnect()

    expect(manager.writeCalls[0]?.base64Value).toBe('Zg==') // 0x66 STOP_WEIGHT_MEAS
    expect(manager.cancelDeviceConnectionCalls).toEqual(['device-1'])
    expect(device.isConnected()).toBe(false)
  })

  it('unsubscribe stops further sample callbacks', async () => {
    const manager = new FakeBleManager()
    const device = new ProgressorDevice(manager as never, 'device-1')
    const samples: number[] = []
    const unsubscribe = device.onSample((s) => samples.push(s.forceKg))

    await device.connect()
    manager.emitNotification(weightMeasurementPacket([{ weightKg: 1, timestampUs: 0 }]))
    unsubscribe()
    manager.emitNotification(weightMeasurementPacket([{ weightKg: 2, timestampUs: 0 }]))

    expect(samples).toEqual([1])
  })

  describe('nameMatches', () => {
    it('matches devices whose advertised name starts with "Progressor"', () => {
      expect(ProgressorDevice.nameMatches('Progressor_1234')).toBe(true)
      expect(ProgressorDevice.nameMatches('Progressor')).toBe(true)
    })

    it('rejects unrelated or missing names', () => {
      expect(ProgressorDevice.nameMatches('WH-C06')).toBe(false)
      expect(ProgressorDevice.nameMatches(null)).toBe(false)
      expect(ProgressorDevice.nameMatches(undefined)).toBe(false)
      expect(ProgressorDevice.nameMatches('')).toBe(false)
    })
  })
})
