import { EmulatorDevice } from '../../src/services/ble/EmulatorDevice'
import { sequences } from '../../src/services/ble/sequences'
import type { DeviceStatus } from '../../src/services/ble/DeviceSource'

describe('EmulatorDevice', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('rejects an unknown sequence id at construction', () => {
    expect(() => new EmulatorDevice('does-not-exist')).toThrow(/Unknown emulator sequence/)
  })

  it('implements the DeviceSource capabilities contract for an emulator', () => {
    const device = new EmulatorDevice('steady-pull')
    expect(device.kind).toBe('emulator')
    expect(device.capabilities).toEqual({
      hardwareTare: false,
      battery: false,
      requiresConnection: false,
    })
  })

  it('emits connecting then connected status on connect()', async () => {
    const device = new EmulatorDevice('steady-pull')
    const statuses: DeviceStatus[] = []
    device.onStatus((s) => statuses.push(s))

    await device.connect()

    expect(statuses[0]).toEqual({ state: 'connecting' })
    expect(statuses[1]).toEqual({ state: 'connected' })
    expect(device.isConnected()).toBe(true)
  })

  it('emits every point of a batched sequence with no drops', async () => {
    const device = new EmulatorDevice('steady-pull')
    const samples: number[] = []
    device.onSample((s) => samples.push(s.forceKg))

    await device.connect()
    jest.advanceTimersByTime(10_000)

    expect(samples.length).toBe(sequences['steady-pull'].points.length)
  })

  it('paces a single-mode sequence one point at a time, not all at once', async () => {
    const device = new EmulatorDevice('slow-whc06')
    const samples: number[] = []
    device.onSample((s) => samples.push(s.forceKg))

    await device.connect()

    // The first point (offset 0ms) is scheduled via setTimeout(fn, 0), so it
    // needs one tick — advancing by 0ms flushes that without moving fake
    // time forward, proving it's not dumping the whole sequence
    // synchronously at connect().
    jest.advanceTimersByTime(0)
    expect(samples.length).toBe(1)

    jest.advanceTimersByTime(100_000)
    expect(samples.length).toBe(sequences['slow-whc06'].points.length)
  })

  it('the dropout sequence stops emitting and fires a disconnected status', async () => {
    const device = new EmulatorDevice('dropout')
    const statuses: DeviceStatus[] = []
    device.onStatus((s) => statuses.push(s))

    await device.connect()
    jest.advanceTimersByTime(10_000)

    const last = statuses[statuses.length - 1]
    expect(last).toEqual({ state: 'disconnected', reason: 'emulated-dropout' })
  })

  it('disconnect() stops emission and does not fire the dropout reason', async () => {
    const device = new EmulatorDevice('steady-pull')
    const samples: number[] = []
    device.onSample((s) => samples.push(s.forceKg))

    await device.connect()
    jest.advanceTimersByTime(500)
    const countAtDisconnect = samples.length
    await device.disconnect()

    jest.advanceTimersByTime(5000)
    expect(samples.length).toBe(countAtDisconnect)
    expect(device.isConnected()).toBe(false)
  })

  it('unsubscribe stops further callbacks', async () => {
    const device = new EmulatorDevice('steady-pull')
    const samples: number[] = []
    const unsubscribe = device.onSample((s) => samples.push(s.forceKg))

    await device.connect()
    jest.advanceTimersByTime(100)
    unsubscribe()
    const countAtUnsub = samples.length

    jest.advanceTimersByTime(5000)
    expect(samples.length).toBe(countAtUnsub)
  })

  it.each(Object.keys(sequences))('covers the required sequence: %s', (id) => {
    expect(sequences[id]).toBeDefined()
    expect(sequences[id].points.length).toBeGreaterThan(0)
  })

  it('requires all five named sequences from docs/02-ble-protocol.md', () => {
    const required = ['steady-pull', 'repeaters', 'noisy-pull', 'dropout', 'slow-whc06']
    expect(Object.keys(sequences).sort()).toEqual(required.sort())
  })
})
