import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { reduce, createInitialState } from '../../core/protocol/machine'
import type {
  SessionState,
  SetPlan,
  SessionEvent,
  SessionEffect,
} from '../../core/protocol/machine'
import type { DeviceSource, DeviceStatus } from '../../services/ble/DeviceSource'
import { RingBuffer } from '../../core/ringBuffer'
import { SampleDrain } from '../../services/db/sampleDrain'
import type { SampleRepository } from '../../services/db/repositories/sampleRepository'
import type {
  EffortRepository,
  EffortMetrics,
} from '../../services/db/repositories/effortRepository'
import { computeRollingPeak } from '../../core/metrics/rollingPeak'
import { computeTut } from '../../core/metrics/tut'
import { computeImpulse } from '../../core/metrics/impulse'
import type { Sample } from '../../core/metrics/rollingPeak'
import type { Band } from '../../core/metrics/band'
import type { CuePlayer } from '../../services/cues/CuePlayer'
import { createZoneCueTriggerState, evaluateZoneCue, evaluateTutTargetCue } from './zoneCueTrigger'
import type { ZoneCueTriggerState } from './zoneCueTrigger'
import type { Hand } from '../../core/types'

const TICK_INTERVAL_MS = 200

export interface SessionRunnerConfig {
  plan: SetPlan
  /** null for max-effort sets — no band, no zone cues, no TUT. */
  band: Band | null
  setId: string
  deviceType: 'progressor' | 'whc06' | 'emulator'
  deviceSequence?: string
}

/** The narrow slice of React Native's AppState this hook actually uses — injectable so tests don't need a real NativeEventEmitter. */
export interface AppStateSource {
  addEventListener(
    type: 'change',
    listener: (state: 'active' | 'background' | 'inactive' | 'unknown' | 'extension') => void,
  ): { remove(): void }
}

export interface SessionRunnerDeps {
  device: DeviceSource
  cues: CuePlayer
  effortRepository: EffortRepository
  sampleRepository: SampleRepository
  /** Defaults to React Native's real AppState — override in tests with a fake. */
  appStateSource?: AppStateSource
}

export interface SessionRunnerHandle {
  state: SessionState
  /** Stable identity across renders (created once via useState's lazy initializer) — safe to pass into a chart's own effect deps. */
  liveBuffer: RingBuffer
  deviceStatus: DeviceStatus
  start: () => void
  skip: () => void
  abort: () => void
  /** User's explicit choice after a DEVICE_RESTORED offer, per docs/04 "never silently resume." */
  resumeAfterReconnect: () => void
  discardAndRedo: () => void
}

/**
 * The effect layer — owns the real timer, subscribes to the device, plays
 * cues, and persists. Translates the state machine's declared `effects`
 * into actual side effects. See docs/07-architecture.md "Session state
 * machine": "The effect layer... translates the machine's declared
 * intentions... into actual side effects."
 */
export function useSessionRunner(
  config: SessionRunnerConfig,
  deps: SessionRunnerDeps,
): SessionRunnerHandle {
  const [machineState, setMachineState] = useState<SessionState>(() =>
    createInitialState(config.plan),
  )
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>({ state: 'disconnected' })

  // liveBuffer is a stable object identity for the lifetime of this hook
  // instance — created once via useState's lazy initializer (never
  // re-created, never reassigned) so it's safe to return directly for a
  // caller (ForceChart) to depend on. useRef().current is intentionally
  // avoided here: the project's lint rules forbid reading ref.current
  // during render, even for objects whose identity is render-stable.
  const [liveBuffer] = useState(() => new RingBuffer())

  const drainRef = useRef<SampleDrain | null>(null)
  const currentEffortIdRef = useRef<string | null>(null)
  const effortSamplesRef = useRef<Sample[]>([])
  /** Monotonic offsetMs fallback for devices with no native timestamp (WH-C06) — see the onSample handler below. */
  const nextFallbackOffsetMsRef = useRef(0)
  const zoneCueStateRef = useRef<ZoneCueTriggerState>(createZoneCueTriggerState())
  const sampleRateStartRef = useRef<number | null>(null)
  const sampleCountRef = useRef(0)
  const lastCountdownSecondRef = useRef<number | null>(null)

  const startEffort = useCallback(
    async (hand: Hand) => {
      effortSamplesRef.current = []
      nextFallbackOffsetMsRef.current = 0
      sampleRateStartRef.current = Date.now()
      sampleCountRef.current = 0
      zoneCueStateRef.current = createZoneCueTriggerState()
      liveBuffer.clear()

      const effort = await deps.effortRepository.start({
        setId: config.setId,
        hand,
        deviceType: config.deviceType,
        deviceSequence: config.deviceSequence,
      })
      currentEffortIdRef.current = effort.id

      const drain = new SampleDrain(liveBuffer, deps.sampleRepository, effort.id)
      drain.start()
      drainRef.current = drain
    },
    [
      config.setId,
      config.deviceType,
      config.deviceSequence,
      deps.effortRepository,
      deps.sampleRepository,
      liveBuffer,
    ],
  )

  const endEffort = useCallback(
    async (status: 'completed' | 'aborted' | 'disconnected') => {
      const effortId = currentEffortIdRef.current
      if (!effortId) return

      await drainRef.current?.stop()
      drainRef.current = null

      const samples = effortSamplesRef.current
      const peak = computeRollingPeak(samples)
      const impulseKgS = computeImpulse(samples)
      const durationS =
        samples.length > 1 ? (samples[samples.length - 1].offsetMs - samples[0].offsetMs) / 1000 : 0
      const meanForceKg = durationS > 0 ? impulseKgS / durationS : 0

      let metrics: EffortMetrics = {
        peakForceSmoothedKg: peak.smoothedPeakKg,
        smoothingWindowMs: peak.windowMs,
        peakForceInstantKg: peak.instantPeakKg,
        meanForceKg,
        impulseKgS,
        timeUnderTensionMs: null,
        timeInBandMs: null,
        timeAboveBandMs: null,
        timeBelowBandMs: null,
        timeToPeakMs: null,
        timeToTargetMs: null,
        fatigueIndex: null,
      }

      if (config.band) {
        const tut = computeTut(samples, config.band)
        metrics = {
          ...metrics,
          timeUnderTensionMs: tut.timeUnderTensionMs,
          timeInBandMs: tut.timeInBandMs,
          timeAboveBandMs: tut.timeAboveBandMs,
          timeBelowBandMs: tut.timeBelowBandMs,
          timeToTargetMs: tut.timeToTargetMs,
        }
      }

      const sampleRateHz =
        sampleRateStartRef.current && sampleCountRef.current > 0
          ? sampleCountRef.current / ((Date.now() - sampleRateStartRef.current) / 1000)
          : null

      await deps.effortRepository.end(effortId, status, metrics, sampleRateHz)
      currentEffortIdRef.current = null
    },
    [config.band, deps.effortRepository],
  )

  const runEffects = useCallback(
    async (effects: SessionEffect[]) => {
      for (const effect of effects) {
        switch (effect.kind) {
          case 'playCue':
            // The machine's playCue union is a subset of CuePlayer's
            // CueKind (it never emits 'countdown-go' or
            // 'tut-target-reached' — those are detected from live samples
            // or the countdown timer below, not by the reducer itself), so
            // this assignment is always valid without a runtime mapping.
            void deps.cues.playCue(effect.cue)
            break
          case 'persistEffortStart':
            await startEffort(effect.hand)
            break
          case 'persistEffortEnd':
            await endEffort(effect.status)
            break
        }
      }
    },
    [deps.cues, startEffort, endEffort],
  )

  const dispatch = useCallback(
    (event: SessionEvent) => {
      setMachineState((prev) => {
        const result = reduce(prev, event)
        void runEffects(result.effects)
        return result.state
      })
    },
    [runEffects],
  )

  // Subscribe to the device — samples feed the ring buffer (for the chart
  // and DB drain) and, while 'working' with a band, drive zone/TUT cues.
  useEffect(() => {
    const unsubscribeSample = deps.device.onSample((sample) => {
      // Prefer the device's own timestamp when available (Progressor
      // provides deviceTimestampMs per docs/02) since multiple samples can
      // legitimately arrive in the same wall-clock millisecond — a
      // Progressor notification batches several 8-byte samples at once,
      // and Date.now() has only millisecond resolution regardless. Falling
      // back to a monotonic per-effort counter (not a raw Date.now() read)
      // guarantees offsetMs is always strictly increasing, which the
      // sample table's (effort_id, offset_ms) primary key requires.
      const offsetMs =
        sample.deviceTimestampMs !== undefined
          ? sample.deviceTimestampMs
          : nextFallbackOffsetMsRef.current++
      liveBuffer.push(sample.forceKg, offsetMs)
      effortSamplesRef.current.push({ offsetMs, forceKg: sample.forceKg })
      sampleCountRef.current += 1

      dispatch({ type: 'SAMPLE', forceKg: sample.forceKg })

      setMachineState((current) => {
        if (current.phase === 'working' && config.band) {
          const zoneResult = evaluateZoneCue(zoneCueStateRef.current, sample.forceKg, config.band)
          zoneCueStateRef.current = zoneResult.state
          if (zoneResult.cue) void deps.cues.playCue(zoneResult.cue)

          const tut = computeTut(effortSamplesRef.current, config.band)
          const tutResult = evaluateTutTargetCue(
            zoneCueStateRef.current,
            tut.timeUnderTensionMs,
            current.plan.workDurationMs,
          )
          zoneCueStateRef.current = tutResult.state
          if (tutResult.cue) void deps.cues.playCue(tutResult.cue)
        }
        return current
      })
    })

    const unsubscribeStatus = deps.device.onStatus((status) => {
      setDeviceStatus(status)
      if (status.state === 'disconnected') {
        dispatch({ type: 'DEVICE_LOST' })
      }
    })

    return () => {
      unsubscribeSample()
      unsubscribeStatus()
    }
  }, [deps.device, deps.cues, config.band, dispatch, liveBuffer])

  // App backgrounded mid-set — see docs/04 "Visual states / edge cases":
  // "treat as an interruption: pause, mark the set, offer resume on
  // return. Don't pretend the data is continuous." The reducer's
  // BACKGROUNDED handling (machine.ts) already does exactly this; this
  // effect is the missing wire from the OS's actual lifecycle signal to
  // that existing logic. Only the background transition dispatches —
  // returning to foreground does NOT auto-resume (matches DEVICE_RESTORED's
  // "never silently resume": the interrupted screen's explicit
  // resume/redo choice is what continues the set, not merely reappearing).
  useEffect(() => {
    const source = deps.appStateSource ?? AppState
    const subscription = source.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        dispatch({ type: 'BACKGROUNDED' })
      }
    })
    return () => subscription.remove()
  }, [dispatch, deps.appStateSource])

  // Drive TICK on a real timer, plus the countdown tick/go cue — "three
  // short ticks, then one longer higher tone" (docs/04) — fired once per
  // whole second of remainingMs while in 'countdown', not once per
  // TICK_INTERVAL_MS.
  useEffect(() => {
    const interval = setInterval(() => {
      setMachineState((current) => {
        if (current.phase === 'countdown') {
          const wholeSecond = Math.ceil(current.remainingMs / 1000)
          if (lastCountdownSecondRef.current !== wholeSecond) {
            lastCountdownSecondRef.current = wholeSecond
            void deps.cues.playCue(wholeSecond <= 0 ? 'countdown-go' : 'countdown-tick')
          }
        } else {
          lastCountdownSecondRef.current = null
        }
        return current
      })
      dispatch({ type: 'TICK', deltaMs: TICK_INTERVAL_MS })
    }, TICK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [dispatch, deps.cues])

  const start = useCallback(() => dispatch({ type: 'START' }), [dispatch])
  const skip = useCallback(() => dispatch({ type: 'SKIP' }), [dispatch])
  const abort = useCallback(() => dispatch({ type: 'ABORT' }), [dispatch])

  const resumeAfterReconnect = useCallback(() => {
    dispatch({ type: 'DEVICE_RESTORED' })
  }, [dispatch])

  const discardAndRedo = useCallback(() => {
    // Per docs/04 "resume set vs discard and redo": DEVICE_RESTORED already
    // routes the machine to 'armed' either way (never straight back to
    // 'working' — see docs/07). The distinction between the two user
    // choices is what the CALLER does with the already-persisted partial
    // effort record (kept either way, per docs/06 "never silently
    // discard") — "discard and redo" means the UI won't surface that
    // partial effort's data as if it were the real result, not that the
    // record itself is deleted.
    dispatch({ type: 'DEVICE_RESTORED' })
  }, [dispatch])

  return {
    state: machineState,
    liveBuffer,
    deviceStatus,
    start,
    skip,
    abort,
    resumeAfterReconnect,
    discardAndRedo,
  }
}
