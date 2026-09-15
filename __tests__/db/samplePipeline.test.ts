import { createTestDatabase } from '../testUtils/sqliteTestDb'
import { runMigrations } from '../../src/services/db/migrator'
import { migrations } from '../../src/services/db/migrations'
import { createRepositories } from '../../src/services/db/repositories'
import { RingBuffer } from '../../src/core/ringBuffer'
import { SampleDrain } from '../../src/services/db/sampleDrain'
import { EmulatorDevice } from '../../src/services/ble/EmulatorDevice'
import { sequences } from '../../src/services/ble/sequences'

/**
 * End-to-end proof of docs/07-architecture.md "The sample pipeline" and
 * docs/08-roadmap.md Phase 1 "done when": the emulator drives samples
 * through the ring buffer into SQLite at the expected rate, with the
 * expected row count and zero dropped samples.
 */
describe('emulator -> ring buffer -> SQLite pipeline', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

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
      kind: 'max_effort',
      ordinal: 0,
      sourceMaxEffortId: null,
      targetPercent: null,
      targetForceKg: null,
      toleranceBandKg: null,
      plannedWorkMs: null,
      repWorkMs: null,
      repRestMs: null,
      repCount: null,
      interHandRestMs: 5000,
      interSetRestMs: 180_000,
    })

    return { repos, set }
  }

  it('a full emulated effort produces exactly the expected row count with zero drops', async () => {
    const { repos, set } = await setup()
    const effort = await repos.efforts.start({
      setId: set.id,
      hand: 'left',
      deviceType: 'emulator',
      deviceSequence: 'steady-pull',
    })

    const buffer = new RingBuffer()
    const drain = new SampleDrain(buffer, repos.samples, effort.id, 150)
    const device = new EmulatorDevice('steady-pull')

    let sampleCount = 0
    device.onSample((s) => {
      buffer.push(s.forceKg, s.deviceTimestampMs ?? 0)
      sampleCount++
    })

    drain.start()
    await device.connect()
    // EmulatorDevice loops a sequence by default (a canned clip must be able
    // to outlast a live "working" phase) — advance only through one lap so
    // this stays a "zero drops in one lap" assertion, not "it stops on its
    // own", which is no longer true for a looping sequence.
    jest.advanceTimersByTime(sequences['steady-pull'].points.at(-1)!.offsetMs)
    await drain.stop()
    await device.disconnect()

    const expectedSamples = sequences['steady-pull'].points.length
    expect(sampleCount).toBe(expectedSamples)

    const storedCount = await repos.samples.countByEffort(effort.id)
    expect(storedCount).toBe(expectedSamples)
  })

  it('drains in multiple batches, not one giant insert at the end', async () => {
    const { repos, set } = await setup()
    const effort = await repos.efforts.start({
      setId: set.id,
      hand: 'left',
      deviceType: 'emulator',
      deviceSequence: 'repeaters',
    })

    const buffer = new RingBuffer()
    const drain = new SampleDrain(buffer, repos.samples, effort.id, 150)
    const device = new EmulatorDevice('repeaters')
    device.onSample((s) => buffer.push(s.forceKg, s.deviceTimestampMs ?? 0))

    drain.start()
    await device.connect()

    // Advance in 150ms steps (one drain interval each) and check the count
    // grows incrementally rather than staying at 0 until a final flush.
    // The drain's flush is async (real SQLite I/O even in-memory), so a
    // microtask flush (await Promise.resolve()) is needed after advancing
    // fake timers before the write is observable — advanceTimersByTime
    // itself only runs due *timer callbacks* synchronously, not the promise
    // chains they kick off.
    jest.advanceTimersByTime(150)
    await Promise.resolve()
    await Promise.resolve()
    const afterOneDrain = await repos.samples.countByEffort(effort.id)
    expect(afterOneDrain).toBeGreaterThan(0)

    jest.advanceTimersByTime(150)
    await Promise.resolve()
    await Promise.resolve()
    const afterTwoDrains = await repos.samples.countByEffort(effort.id)
    expect(afterTwoDrains).toBeGreaterThan(afterOneDrain)

    await drain.stop()
    await device.disconnect()
  })

  it('samples land with monotonically increasing offsets, no reordering', async () => {
    const { repos, set } = await setup()
    const effort = await repos.efforts.start({
      setId: set.id,
      hand: 'right',
      deviceType: 'emulator',
      deviceSequence: 'noisy-pull',
    })

    const buffer = new RingBuffer()
    const drain = new SampleDrain(buffer, repos.samples, effort.id, 150)
    const device = new EmulatorDevice('noisy-pull')
    device.onSample((s) => buffer.push(s.forceKg, s.deviceTimestampMs ?? 0))

    drain.start()
    await device.connect()
    jest.advanceTimersByTime(sequences['noisy-pull'].points.at(-1)!.offsetMs)
    await drain.stop()
    await device.disconnect()

    const stored = await repos.samples.listByEffort(effort.id)
    for (let i = 1; i < stored.length; i++) {
      expect(stored[i].offsetMs).toBeGreaterThan(stored[i - 1].offsetMs)
    }
  })

  it('the dropout sequence leaves a real gap, not a fabricated tail of zeros', async () => {
    const { repos, set } = await setup()
    const effort = await repos.efforts.start({
      setId: set.id,
      hand: 'left',
      deviceType: 'emulator',
      deviceSequence: 'dropout',
    })

    const buffer = new RingBuffer()
    const drain = new SampleDrain(buffer, repos.samples, effort.id, 150)
    const device = new EmulatorDevice('dropout')
    device.onSample((s) => buffer.push(s.forceKg, s.deviceTimestampMs ?? 0))

    let disconnected = false
    device.onStatus((status) => {
      if (status.state === 'disconnected') disconnected = true
    })

    drain.start()
    await device.connect()
    jest.advanceTimersByTime(10_000)
    await drain.stop()

    expect(disconnected).toBe(true)
    // Per docs/06-non-functional-and-open-source.md "Data integrity": never
    // fabricate samples. Stored count must equal exactly what the sequence
    // emitted before it stopped — no zero-filled or interpolated tail.
    const expectedSamples = sequences['dropout'].points.length
    const storedCount = await repos.samples.countByEffort(effort.id)
    expect(storedCount).toBe(expectedSamples)
    expect(storedCount).toBeLessThan(10_000 / 16) // proves it actually stopped early, not a tautology
  })

  it('WH-C06-like single-pacing sequence also reaches SQLite with zero drops', async () => {
    const { repos, set } = await setup()
    const effort = await repos.efforts.start({
      setId: set.id,
      hand: 'left',
      deviceType: 'emulator',
      deviceSequence: 'slow-whc06',
    })

    const buffer = new RingBuffer()
    const drain = new SampleDrain(buffer, repos.samples, effort.id, 150)
    const device = new EmulatorDevice('slow-whc06')
    device.onSample((s) => buffer.push(s.forceKg, s.deviceTimestampMs ?? 0))

    drain.start()
    await device.connect()
    jest.advanceTimersByTime(sequences['slow-whc06'].points.at(-1)!.offsetMs)
    await drain.stop()
    await device.disconnect()

    const expectedSamples = sequences['slow-whc06'].points.length
    const storedCount = await repos.samples.countByEffort(effort.id)
    expect(storedCount).toBe(expectedSamples)
  })
})
