import { renderHook, act } from '@testing-library/react-native'
import { useSessionRunner } from '../../src/features/session/useSessionRunner'
import type { SetPlan } from '../../src/core/protocol/machine'
import { FakeDeviceSource } from './testUtils/fakeDeviceSource'
import { makeFakeCuePlayer } from './testUtils/fakeCuePlayer'
import { FakeAppStateSource } from './testUtils/fakeAppStateSource'
import { createTestDatabase } from '../testUtils/sqliteTestDb'
import { runMigrations } from '../../src/services/db/migrator'
import { migrations } from '../../src/services/db/migrations'
import { createRepositories } from '../../src/services/db/repositories'
import type { Band } from '../../src/core/metrics/band'

// Fake timers throughout — useSessionRunner drives TICK off a real
// setInterval, and combining that with @testing-library's real-timer
// waitFor polling produced a genuine hang (two independent timer sources
// racing). Advancing fake timers deterministically inside act() avoids the
// nondeterminism entirely rather than trying to out-wait it.
jest.useFakeTimers()

const plan: SetPlan = {
  setCount: 1,
  hands: ['left', 'right'],
  workDurationMs: 1000,
  countdownMs: 0,
  interHandRestMs: 0,
  interSetRestMs: 0,
  autoStartThresholdKg: 5,
}

async function setup() {
  const db = createTestDatabase()
  await runMigrations(db, migrations)
  await db.execAsync(`PRAGMA foreign_keys = ON;`)
  const repos = createRepositories(db)

  const exercise = await repos.exercises.create({
    name: 'Block Pull',
    gripType: 'half-crimp',
    edgeDepthMm: 20,
    modality: 'block_pull',
    notes: null,
  })
  const session = await repos.sessions.start({ bodyweightKg: 80 })
  const set = await repos.trainingSets.create({
    sessionId: session.id,
    exerciseId: exercise.id,
    kind: 'target_band',
    ordinal: 0,
    sourceMaxEffortId: null,
    targetPercent: 80,
    targetForceKg: 25,
    toleranceBandKg: 5,
    plannedWorkMs: 1000,
    repWorkMs: null,
    repRestMs: null,
    repCount: null,
    interHandRestMs: 0,
    interSetRestMs: 0,
  })

  const device = new FakeDeviceSource()
  const cues = makeFakeCuePlayer()

  return { repos, set, device, cues }
}

/** Advances the hook's TICK timer (200ms interval) by one tick, flushing pending microtasks/effects. */
async function advanceOneTick() {
  await act(async () => {
    jest.advanceTimersByTime(200)
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** Flushes pending microtasks (DB writes, etc.) without advancing timers. */
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useSessionRunner', () => {
  it('starts idle and moves to armed after one TICK when countdownMs is 0', async () => {
    const { repos, set, device, cues } = await setup()
    const band: Band = { targetKg: 25, toleranceKg: 5 }

    const { result } = renderHook(() =>
      useSessionRunner(
        { plan, band, setId: set.id, deviceType: 'emulator', deviceSequence: 'steady-pull' },
        { device, cues, effortRepository: repos.efforts, sampleRepository: repos.samples },
      ),
    )

    expect(result.current.state.phase).toBe('idle')

    act(() => result.current.start())
    expect(result.current.state.phase).toBe('countdown')

    await advanceOneTick()
    expect(result.current.state.phase).toBe('armed')
  })

  it('crossing the auto-start threshold moves to working and persists an effort start', async () => {
    const { repos, set, device, cues } = await setup()
    const band: Band = { targetKg: 25, toleranceKg: 5 }

    const { result } = renderHook(() =>
      useSessionRunner(
        { plan, band, setId: set.id, deviceType: 'emulator', deviceSequence: 'steady-pull' },
        { device, cues, effortRepository: repos.efforts, sampleRepository: repos.samples },
      ),
    )

    act(() => result.current.start())
    await advanceOneTick()
    expect(result.current.state.phase).toBe('armed')

    act(() => device.emitSample(10)) // above autoStartThresholdKg
    await flushMicrotasks()
    expect(result.current.state.phase).toBe('working')

    const efforts = await repos.efforts.listBySet(set.id)
    expect(efforts).toHaveLength(1)
    expect(efforts[0].hand).toBe('left')
  })

  it('samples pushed while working land in the live ring buffer', async () => {
    const { repos, set, device, cues } = await setup()
    const band: Band = { targetKg: 25, toleranceKg: 5 }

    const { result } = renderHook(() =>
      useSessionRunner(
        { plan, band, setId: set.id, deviceType: 'emulator', deviceSequence: 'steady-pull' },
        { device, cues, effortRepository: repos.efforts, sampleRepository: repos.samples },
      ),
    )

    act(() => result.current.start())
    await advanceOneTick()
    act(() => device.emitSample(10))
    await flushMicrotasks()
    expect(result.current.state.phase).toBe('working')

    act(() => device.emitSample(30))
    act(() => device.emitSample(32))
    await flushMicrotasks()

    expect(result.current.liveBuffer.size()).toBeGreaterThanOrEqual(2)
  })

  it('a DEVICE_LOST status while working interrupts and marks the effort disconnected', async () => {
    const { repos, set, device, cues } = await setup()
    const band: Band = { targetKg: 25, toleranceKg: 5 }

    const { result } = renderHook(() =>
      useSessionRunner(
        { plan, band, setId: set.id, deviceType: 'emulator', deviceSequence: 'steady-pull' },
        { device, cues, effortRepository: repos.efforts, sampleRepository: repos.samples },
      ),
    )

    act(() => result.current.start())
    await advanceOneTick()
    act(() => device.emitSample(10))
    await flushMicrotasks()
    expect(result.current.state.phase).toBe('working')

    act(() => device.emitStatus({ state: 'disconnected', reason: 'test' }))
    await flushMicrotasks()
    expect(result.current.state.phase).toBe('interrupted')

    const efforts = await repos.efforts.listBySet(set.id)
    expect(efforts[0].status).toBe('disconnected')
  })

  it('backgrounding the app while working interrupts the set and marks the effort aborted', async () => {
    const { repos, set, device, cues } = await setup()
    const band: Band = { targetKg: 25, toleranceKg: 5 }
    const appStateSource = new FakeAppStateSource()

    const { result } = renderHook(() =>
      useSessionRunner(
        { plan, band, setId: set.id, deviceType: 'emulator', deviceSequence: 'steady-pull' },
        {
          device,
          cues,
          effortRepository: repos.efforts,
          sampleRepository: repos.samples,
          appStateSource,
        },
      ),
    )

    act(() => result.current.start())
    await advanceOneTick()
    act(() => device.emitSample(10))
    await flushMicrotasks()
    expect(result.current.state.phase).toBe('working')

    act(() => appStateSource.emit('background'))
    await flushMicrotasks()

    expect(result.current.state.phase).toBe('interrupted')
    const efforts = await repos.efforts.listBySet(set.id)
    expect(efforts[0].status).toBe('aborted')
  })

  it('does not interrupt while idle — backgrounding before a set even starts is a no-op', async () => {
    const { repos, set, device, cues } = await setup()
    const band: Band = { targetKg: 25, toleranceKg: 5 }
    const appStateSource = new FakeAppStateSource()

    const { result } = renderHook(() =>
      useSessionRunner(
        { plan, band, setId: set.id, deviceType: 'emulator', deviceSequence: 'steady-pull' },
        {
          device,
          cues,
          effortRepository: repos.efforts,
          sampleRepository: repos.samples,
          appStateSource,
        },
      ),
    )

    act(() => appStateSource.emit('background'))
    await flushMicrotasks()

    expect(result.current.state.phase).toBe('idle')
  })

  it('returning to the foreground does not auto-resume — matches "never silently resume" (docs/04)', async () => {
    const { repos, set, device, cues } = await setup()
    const band: Band = { targetKg: 25, toleranceKg: 5 }
    const appStateSource = new FakeAppStateSource()

    const { result } = renderHook(() =>
      useSessionRunner(
        { plan, band, setId: set.id, deviceType: 'emulator', deviceSequence: 'steady-pull' },
        {
          device,
          cues,
          effortRepository: repos.efforts,
          sampleRepository: repos.samples,
          appStateSource,
        },
      ),
    )

    act(() => result.current.start())
    await advanceOneTick()
    act(() => device.emitSample(10))
    await flushMicrotasks()

    act(() => appStateSource.emit('background'))
    await flushMicrotasks()
    expect(result.current.state.phase).toBe('interrupted')

    act(() => appStateSource.emit('active'))
    await flushMicrotasks()
    expect(result.current.state.phase).toBe('interrupted') // still requires an explicit resume/redo choice
  })

  it('resumeAfterReconnect returns to armed, never directly to working (per docs/04)', async () => {
    const { repos, set, device, cues } = await setup()
    const band: Band = { targetKg: 25, toleranceKg: 5 }

    const { result } = renderHook(() =>
      useSessionRunner(
        { plan, band, setId: set.id, deviceType: 'emulator', deviceSequence: 'steady-pull' },
        { device, cues, effortRepository: repos.efforts, sampleRepository: repos.samples },
      ),
    )

    act(() => result.current.start())
    await advanceOneTick()
    act(() => device.emitSample(10))
    await flushMicrotasks()
    act(() => device.emitStatus({ state: 'disconnected', reason: 'test' }))
    await flushMicrotasks()
    expect(result.current.state.phase).toBe('interrupted')

    act(() => result.current.resumeAfterReconnect())
    await flushMicrotasks()
    expect(result.current.state.phase).toBe('armed')
  })

  it('crossing into the band during working plays "entered-band"', async () => {
    const { repos, set, device, cues } = await setup()
    const band: Band = { targetKg: 25, toleranceKg: 5 }

    const { result } = renderHook(() =>
      useSessionRunner(
        { plan, band, setId: set.id, deviceType: 'emulator', deviceSequence: 'steady-pull' },
        { device, cues, effortRepository: repos.efforts, sampleRepository: repos.samples },
      ),
    )

    act(() => result.current.start())
    await advanceOneTick()
    act(() => device.emitSample(10)) // crosses auto-start AND is below band
    await flushMicrotasks()
    expect(result.current.state.phase).toBe('working')

    act(() => device.emitSample(28)) // now in-band
    await flushMicrotasks()
    expect(cues.played).toContain('entered-band')
  })

  it('dropping below the band during working plays "dropped-below"', async () => {
    const { repos, set, device, cues } = await setup()
    const band: Band = { targetKg: 25, toleranceKg: 5 }

    const { result } = renderHook(() =>
      useSessionRunner(
        { plan, band, setId: set.id, deviceType: 'emulator', deviceSequence: 'steady-pull' },
        { device, cues, effortRepository: repos.efforts, sampleRepository: repos.samples },
      ),
    )

    act(() => result.current.start())
    await advanceOneTick()
    act(() => device.emitSample(30)) // crosses threshold AND already in-band
    await flushMicrotasks()
    expect(result.current.state.phase).toBe('working')

    act(() => device.emitSample(5)) // drops below
    await flushMicrotasks()
    expect(cues.played).toContain('dropped-below')
  })
})
