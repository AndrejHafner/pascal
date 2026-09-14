import { WHC06Device } from '../../src/services/ble/WHC06Device'
import { FakeBleManager } from './testUtils/fakeBleManager'
import { weightPayload } from './fixtures/whc06Payloads'
import type { DeviceStatus } from '../../src/services/ble/DeviceSource'

/** Prefixes weightPayload's raw AD-structure bytes with the 2-byte LE
 * manufacturer company id, matching what WHC06Device.handleScanResult
 * expects to find at offset 0-1 before stripping it — see docs/02 and the
 * ASSUMPTION comment in WHC06Device.ts about this exact layout being
 * hardware-unverified. */
function manufacturerDataWithId(companyId: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + payload.length)
  out[0] = companyId & 0xff
  out[1] = (companyId >> 8) & 0xff
  out.set(payload, 2)
  return out
}

describe('WHC06Device', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('reports the correct kind and capabilities (no hardware tare, no battery, no connection)', () => {
    const manager = new FakeBleManager()
    const device = new WHC06Device(manager as never)
    expect(device.kind).toBe('whc06')
    expect(device.capabilities).toEqual({
      hardwareTare: false,
      battery: false,
      requiresConnection: false,
    })
  })

  it('connect() starts a duplicate-allowing scan and reports connected', async () => {
    const manager = new FakeBleManager()
    const device = new WHC06Device(manager as never)
    const statuses: DeviceStatus[] = []
    device.onStatus((s) => statuses.push(s))

    await device.connect()

    expect(manager.startDeviceScan).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ allowDuplicates: true }),
      expect.any(Function),
    )
    expect(statuses).toEqual([{ state: 'connecting' }, { state: 'connected' }])
    expect(device.isConnected()).toBe(true)
  })

  it('parses a matching manufacturer-id advertisement into a RawSample', async () => {
    const manager = new FakeBleManager()
    const device = new WHC06Device(manager as never)
    const samples: number[] = []
    device.onSample((s) => samples.push(s.forceKg))

    await device.connect()
    manager.emitScanResult('addr-1', 'IF_B7', manufacturerDataWithId(0x0100, weightPayload(0x04d2)))

    expect(samples).toHaveLength(1)
    expect(samples[0]).toBeCloseTo(12.34, 4)
  })

  it('ignores advertisements from a non-matching manufacturer id', async () => {
    const manager = new FakeBleManager()
    const device = new WHC06Device(manager as never)
    const samples: number[] = []
    device.onSample((s) => samples.push(s.forceKg))

    await device.connect()
    manager.emitScanResult(
      'addr-2',
      'SomeOtherDevice',
      manufacturerDataWithId(0x004c, weightPayload(0x04d2)), // Apple's company id, not 0x0100
    )

    expect(samples).toEqual([])
  })

  it('ignores scan results with no manufacturer data at all', async () => {
    const manager = new FakeBleManager()
    const device = new WHC06Device(manager as never)
    const samples: number[] = []
    device.onSample((s) => samples.push(s.forceKg))

    await device.connect()
    manager.emitScanResult('addr-3', 'Unrelated', null)

    expect(samples).toEqual([])
  })

  it('applies a software tare baseline on the next sample after tare()', async () => {
    const manager = new FakeBleManager()
    const device = new WHC06Device(manager as never)
    const samples: number[] = []
    device.onSample((s) => samples.push(s.forceKg))

    await device.connect()
    manager.emitScanResult('addr-1', 'IF_B7', manufacturerDataWithId(0x0100, weightPayload(1000))) // 10.00kg baseline established
    await device.tare()
    manager.emitScanResult('addr-1', 'IF_B7', manufacturerDataWithId(0x0100, weightPayload(1000))) // becomes the new baseline (0)
    manager.emitScanResult('addr-1', 'IF_B7', manufacturerDataWithId(0x0100, weightPayload(1500))) // 5.00kg above new baseline

    expect(samples[0]).toBeCloseTo(10, 4) // first sample: baseline auto-set, so raw value
    expect(samples[1]).toBeCloseTo(0, 4) // tare's baseline sample reads as zero
    expect(samples[2]).toBeCloseTo(5, 4)
  })

  it('fires a disconnected status after 10s with no advertisement (watchdog)', async () => {
    const manager = new FakeBleManager()
    const device = new WHC06Device(manager as never)
    const statuses: DeviceStatus[] = []
    device.onStatus((s) => statuses.push(s))

    await device.connect()
    jest.advanceTimersByTime(10_000)

    const last = statuses[statuses.length - 1]
    expect(last).toEqual({ state: 'disconnected', reason: 'advertisement-timeout' })
  })

  it('a fresh advertisement resets the watchdog before it fires', async () => {
    const manager = new FakeBleManager()
    const device = new WHC06Device(manager as never)
    const statuses: DeviceStatus[] = []
    device.onStatus((s) => statuses.push(s))

    await device.connect()
    jest.advanceTimersByTime(9000)
    manager.emitScanResult('addr-1', 'IF_B7', manufacturerDataWithId(0x0100, weightPayload(1000)))
    jest.advanceTimersByTime(9000) // total 18s elapsed, but only 9s since the reset

    expect(statuses.some((s) => s.state === 'disconnected')).toBe(false)
  })

  it('disconnect() stops the scan and does not fire the watchdog afterward', async () => {
    const manager = new FakeBleManager()
    const device = new WHC06Device(manager as never)
    const statuses: DeviceStatus[] = []
    device.onStatus((s) => statuses.push(s))

    await device.connect()
    await device.disconnect()

    expect(manager.stopDeviceScanCalled).toBe(true)
    expect(device.isConnected()).toBe(false)

    const countAtDisconnect = statuses.length
    jest.advanceTimersByTime(15_000)
    expect(statuses.length).toBe(countAtDisconnect)
  })

  it('a scan error surfaces as a disconnected status', async () => {
    const manager = new FakeBleManager()
    const device = new WHC06Device(manager as never)
    const statuses: DeviceStatus[] = []
    device.onStatus((s) => statuses.push(s))

    await device.connect()
    manager.emitScanError(new Error('bluetooth off'))

    const last = statuses[statuses.length - 1]
    expect(last).toEqual({ state: 'disconnected', reason: 'bluetooth off' })
  })
})
