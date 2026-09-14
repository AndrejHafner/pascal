import { createTestDatabase } from '../../testUtils/sqliteTestDb'
import { runMigrations } from '../../../src/services/db/migrator'
import { migrations } from '../../../src/services/db/migrations'
import { createRepositories } from '../../../src/services/db/repositories'
import { EmulatorDevice } from '../../../src/services/ble/EmulatorDevice'
import { reduce, createInitialState } from '../../../src/core/protocol/machine'
import type { SetPlan, SessionState } from '../../../src/core/protocol/machine'
import { computeRollingPeak } from '../../../src/core/metrics/rollingPeak'
import { computeTut } from '../../../src/core/metrics/tut'
import { computeImpulse } from '../../../src/core/metrics/impulse'
import type { Sample } from '../../../src/core/metrics/rollingPeak'
import type { Band } from '../../../src/core/metrics/tut'
import type { Hand } from '../../../src/core/types'

/**
 * End-to-end proof of docs/08-roadmap.md Phase 3 "done when": "a full
 * emulated session runs start-to-finish headlessly, persisting correct
 * efforts and metrics." Wires the pieces Phase 1-3 built — EmulatorDevice,
 * the session state machine, the metrics layer, and the real repositories
 * (against real SQLite, same adapter as the Phase 1 pipeline test) — into
 * one flow with no UI and no hardware, mirroring what the Phase 4/5 effect
 * layer will eventually do for real.
 */
describe('full emulated session — headless', () => {
  jest.useFakeTimers()

  async function setupDb() {
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
    return { repos, exercise, session }
  }

  it('runs a two-hand target-band set against the emulator, persisting correct efforts and metrics', async () => {
    const { repos, exercise, session } = await setupDb()

    const band: Band = { targetKg: 25, toleranceKg: 5 } // steady-pull settles at 30kg -> in-band
    const trainingSet = await repos.trainingSets.create({
      sessionId: session.id,
      exerciseId: exercise.id,
      kind: 'target_band',
      ordinal: 0,
      sourceMaxEffortId: null,
      targetPercent: 80,
      targetForceKg: band.targetKg,
      toleranceBandKg: band.toleranceKg,
      plannedWorkMs: 5400,
      repWorkMs: null,
      repRestMs: null,
      repCount: null,
      interHandRestMs: 100,
      interSetRestMs: 100,
    })

    const plan: SetPlan = {
      setCount: 1,
      hands: ['left', 'right'],
      workDurationMs: 5400, // matches the steady-pull sequence's total duration
      countdownMs: 0,
      interHandRestMs: 100,
      interSetRestMs: 100,
      autoStartThresholdKg: 5,
    }

    let machineState: SessionState = createInitialState(plan)
    machineState = reduce(machineState, { type: 'START' }).state
    machineState = reduce(machineState, { type: 'TICK', deltaMs: 0 }).state // countdown(0ms) -> armed
    expect(machineState.phase).toBe('armed')

    // Run one full hand's effort against the real EmulatorDevice, collecting
    // samples exactly as the drain loop would, then persist + compute
    // metrics exactly as the effect layer will in Phase 4/5.
    async function runHandEffort(hand: Hand): Promise<void> {
      expect(machineState.phase).toBe('armed')

      const device = new EmulatorDevice('steady-pull')
      const collected: Sample[] = []
      device.onSample((s) => {
        collected.push({
          offsetMs: s.deviceTimestampMs ?? collected.length * 16,
          forceKg: s.forceKg,
        })
      })

      await device.connect()
      // steady-pull ramps from 0kg over its first 400ms (see
      // sequences/steadyPull.ts), so the auto-start threshold isn't crossed
      // by the very first sample — advance until a sample actually clears
      // it, mirroring how 'armed' really waits for the ramp-up in
      // docs/04-screens-and-ux.md "Auto-start on force threshold".
      let startResult = reduce(machineState, { type: 'SAMPLE', forceKg: 0 })
      while (startResult.state.phase === 'armed') {
        jest.advanceTimersByTime(16)
        const latest = collected[collected.length - 1]
        startResult = reduce(machineState, { type: 'SAMPLE', forceKg: latest?.forceKg ?? 0 })
      }
      machineState = startResult.state
      expect(machineState.phase).toBe('working')
      expect(startResult.effects).toEqual([{ kind: 'persistEffortStart', hand }])

      const effort = await repos.efforts.start({
        setId: trainingSet.id,
        hand,
        deviceType: 'emulator',
        deviceSequence: 'steady-pull',
      })

      jest.advanceTimersByTime(6000) // let the whole steady-pull sequence emit
      await device.disconnect()

      // Drive the machine's work-duration timer to completion.
      const endResult = reduce(machineState, { type: 'TICK', deltaMs: plan.workDurationMs })
      machineState = endResult.state
      expect(endResult.effects).toEqual([{ kind: 'persistEffortEnd', status: 'completed' }])

      // Compute final metrics from the collected samples — the same
      // functions Phase 3 tested in isolation, now over a real emulated
      // curve — and persist them via the real repository.
      const peak = computeRollingPeak(collected)
      const tut = computeTut(collected, band)
      const impulseKgS = computeImpulse(collected)

      await repos.efforts.end(
        effort.id,
        'completed',
        {
          peakForceSmoothedKg: peak.smoothedPeakKg,
          smoothingWindowMs: peak.windowMs,
          peakForceInstantKg: peak.instantPeakKg,
          meanForceKg:
            impulseKgS /
            ((collected[collected.length - 1].offsetMs - collected[0].offsetMs) / 1000),
          impulseKgS,
          timeUnderTensionMs: tut.timeUnderTensionMs,
          timeInBandMs: tut.timeInBandMs,
          timeAboveBandMs: tut.timeAboveBandMs,
          timeBelowBandMs: tut.timeBelowBandMs,
          timeToPeakMs: null,
          timeToTargetMs: tut.timeToTargetMs,
          fatigueIndex: null,
        },
        null,
      )
      await repos.samples.insertBatch(collected.map((s) => ({ ...s, effortId: effort.id })))

      // Advance past interHandRest/setRest so the next hand starts armed.
      if (machineState.phase === 'interHandRest') {
        machineState = reduce(machineState, { type: 'TICK', deltaMs: plan.interHandRestMs }).state
      }
      if (machineState.phase === 'countdown') {
        machineState = reduce(machineState, { type: 'TICK', deltaMs: plan.countdownMs }).state
      }
    }

    await runHandEffort('left')
    await runHandEffort('right')

    if (machineState.phase === 'setRest') {
      machineState = reduce(machineState, { type: 'TICK', deltaMs: plan.interSetRestMs }).state
    }
    expect(machineState.phase).toBe('done')

    // Verify what actually landed in the database.
    const efforts = await repos.efforts.listBySet(trainingSet.id)
    expect(efforts).toHaveLength(2)
    expect(efforts.map((e) => e.hand).sort()).toEqual(['left', 'right'])

    for (const effort of efforts) {
      expect(effort.status).toBe('completed')
      expect(effort.peakForceSmoothedKg).not.toBeNull()
      expect(effort.peakForceSmoothedKg).toBeGreaterThan(25) // steady-pull settles near 30kg
      // steady-pull holds well above the 20kg lower bound throughout its plateau
      expect(effort.timeUnderTensionMs).not.toBeNull()
      expect(effort.timeUnderTensionMs as number).toBeGreaterThan(4000)

      const storedSamples = await repos.samples.countByEffort(effort.id)
      expect(storedSamples).toBeGreaterThan(0)
    }
  })
})
