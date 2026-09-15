import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useKeepAwake } from 'expo-keep-awake'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { BleManager } from 'react-native-ble-plx'
import { useSessionRunner } from '../../src/features/session/useSessionRunner'
import type { SetPlan } from '../../src/core/protocol/machine'
import type { Band } from '../../src/core/metrics/band'
import { ForceChart } from '../../src/features/chart/ForceChart'
import { createDeviceSource } from '../../src/services/ble/createDeviceSource'
import { CuePlayer } from '../../src/services/cues/CuePlayer'
import { expoHapticsAdapter } from '../../src/services/cues/HapticsAdapter'
import { openDatabase } from '../../src/services/db/client'
import { createRepositories } from '../../src/services/db/repositories'
import type { Repositories } from '../../src/services/db/repositories'
import { formatSeconds, formatMinutesSeconds } from '../../src/features/session/formatDuration'
import { computeTut } from '../../src/core/metrics/tut'
import { classifyZone } from '../../src/core/metrics/zone'
import { colors, spacing, typography } from '../../src/theme/tokens'

/**
 * Live session — the core screen. Runs the whole session state machine:
 * countdown -> armed -> working -> inter-hand rest -> working -> set rest
 * -> next set. See docs/04-screens-and-ux.md "Live session" and
 * docs/07-architecture.md "Session state machine".
 *
 * Route params (all required for now — Session setup, which normally
 * produces these, is Phase 5): setId, targetKg, toleranceKg, workMs,
 * countdownMs, interHandRestMs, interSetRestMs, setCount, deviceSequence
 * (emulator sequence name — real-device selection is also Phase 5 UI).
 */
export default function LiveSessionScreen() {
  useKeepAwake()
  const router = useRouter()
  const params = useLocalSearchParams<{
    setId: string
    targetKg?: string
    toleranceKg?: string
    workMs?: string
    countdownMs?: string
    interHandRestMs?: string
    interSetRestMs?: string
    setCount?: string
    deviceSequence?: string
  }>()

  const [repos, setRepos] = useState<Repositories | null>(null)
  useEffect(() => {
    let cancelled = false
    openDatabase().then((db) => {
      if (!cancelled) setRepos(createRepositories(db))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const manager = useMemo(() => new BleManager(), [])
  useEffect(() => {
    return () => {
      manager.destroy()
    }
  }, [manager])

  const deviceSequence = params.deviceSequence ?? 'steady-pull'
  const device = useMemo(
    () => createDeviceSource(manager, { kind: 'emulator', sequenceId: deviceSequence }),
    [manager, deviceSequence],
  )
  const cues = useMemo(() => new CuePlayer(expoHapticsAdapter), [])

  const plan: SetPlan = useMemo(
    () => ({
      setCount: Number(params.setCount ?? 5),
      hands: ['left', 'right'],
      workDurationMs: Number(params.workMs ?? 10_000),
      countdownMs: Number(params.countdownMs ?? 3000),
      interHandRestMs: Number(params.interHandRestMs ?? 5000),
      interSetRestMs: Number(params.interSetRestMs ?? 180_000),
      autoStartThresholdKg: 5,
    }),
    [
      params.setCount,
      params.workMs,
      params.countdownMs,
      params.interHandRestMs,
      params.interSetRestMs,
    ],
  )

  const band: Band | null = useMemo(() => {
    if (!params.targetKg) return null
    return {
      targetKg: Number(params.targetKg),
      toleranceKg: Number(params.toleranceKg ?? 2),
    }
  }, [params.targetKg, params.toleranceKg])

  const connectedRef = useRef(false)
  useEffect(() => {
    if (!connectedRef.current) {
      connectedRef.current = true
      device.connect()
    }
    return () => {
      device.disconnect()
    }
  }, [device])

  if (!repos) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    )
  }

  return (
    <LiveSessionContent
      plan={plan}
      band={band}
      setId={params.setId}
      deviceSequence={deviceSequence}
      device={device}
      cues={cues}
      repos={repos}
      onExit={() => router.back()}
    />
  )
}

function LiveSessionContent({
  plan,
  band,
  setId,
  deviceSequence,
  device,
  cues,
  repos,
  onExit,
}: {
  plan: SetPlan
  band: Band | null
  setId: string
  deviceSequence: string
  device: ReturnType<typeof createDeviceSource>
  cues: CuePlayer
  repos: Repositories
  onExit: () => void
}) {
  const runner = useSessionRunner(
    { plan, band, setId, deviceType: 'emulator', deviceSequence },
    { device, cues, effortRepository: repos.efforts, sampleRepository: repos.samples },
  )

  const { state } = runner
  const isDisconnected =
    runner.deviceStatus.state === 'disconnected' && state.phase === 'interrupted'

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <SetHandHeader state={state} />

      {state.phase === 'idle' && <StartPrompt onStart={runner.start} />}

      {(state.phase === 'countdown' || state.phase === 'armed') && <CountdownView state={state} />}

      {state.phase === 'working' && (
        <WorkingView plan={plan} band={band} liveBuffer={runner.liveBuffer} />
      )}

      {(state.phase === 'interHandRest' || state.phase === 'setRest') && (
        <RestView state={state} onSkip={runner.skip} />
      )}

      {state.phase === 'done' && <DoneView onExit={onExit} />}

      {isDisconnected && (
        <DisconnectOverlay
          onResume={runner.resumeAfterReconnect}
          onDiscard={runner.discardAndRedo}
        />
      )}

      {state.phase !== 'idle' && state.phase !== 'done' && (
        <TouchableOpacity style={styles.abortButton} onPress={runner.abort}>
          <Text style={styles.abortText}>Abort</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  )
}

function SetHandHeader({ state }: { state: ReturnType<typeof useSessionRunner>['state'] }) {
  const hand = state.plan.hands[state.handIndex % state.plan.hands.length]
  const handColor = hand === 'left' ? colors.handLeft : colors.handRight
  return (
    <View style={styles.header}>
      <Text style={styles.headerText}>
        SET {state.setIndex + 1}/{state.plan.setCount}
      </Text>
      <View style={styles.handIndicator}>
        <View style={[styles.handDot, { backgroundColor: handColor }]} />
        <Text style={[styles.headerText, { color: handColor }]}>{hand.toUpperCase()}</Text>
      </View>
    </View>
  )
}

function StartPrompt({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.centerFill}>
      <TouchableOpacity style={styles.startButton} onPress={onStart}>
        <Text style={styles.startButtonText}>Start</Text>
      </TouchableOpacity>
    </View>
  )
}

function CountdownView({ state }: { state: ReturnType<typeof useSessionRunner>['state'] }) {
  const seconds = Math.max(0, Math.ceil(state.remainingMs / 1000))
  return (
    <View style={styles.centerFill}>
      <Text style={styles.countdownText}>{state.phase === 'armed' ? 'GO' : seconds}</Text>
      <Text style={styles.captionText}>
        {state.phase === 'armed' ? 'pull to start' : 'get ready'}
      </Text>
    </View>
  )
}

function WorkingView({
  plan,
  band,
  liveBuffer,
}: {
  plan: SetPlan
  band: Band | null
  liveBuffer: ReturnType<typeof useSessionRunner>['liveBuffer']
}) {
  const [forceKg, setForceKg] = useState(0)
  const [zone, setZone] = useState<ReturnType<typeof classifyZone> | null>(null)
  const [tutMs, setTutMs] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const startedAtRef = useRef<number | null>(null)
  const samplesRef = useRef<{ offsetMs: number; forceKg: number }[]>([])

  // Reading the clock is a side effect, not something render is allowed to
  // do (per the project's react-hooks/purity lint rule) — this component
  // mounts fresh once per Effort (WorkingView is only rendered while
  // 'working'), so "on mount" is exactly "when this Effort's work begins."
  useEffect(() => {
    startedAtRef.current = Date.now()
    samplesRef.current = []
  }, [])

  return (
    <View style={styles.workingContainer}>
      <Text style={styles.forceText}>{forceKg.toFixed(1)}</Text>
      <Text style={styles.unitText}>kg</Text>

      <View style={styles.chartContainer}>
        <ForceChart
          liveBuffer={liveBuffer}
          band={band}
          onLiveSample={(force, z) => {
            setForceKg(force)
            setZone(z)
            const offsetMs = Date.now() - (startedAtRef.current ?? Date.now())
            samplesRef.current.push({ offsetMs, forceKg: force })
            setElapsedMs(offsetMs)
            if (band) {
              const tut = computeTut(samplesRef.current, band)
              setTutMs(tut.timeUnderTensionMs)
            }
          }}
        />
      </View>

      {band && (
        <View style={styles.tutBarTrack}>
          <View
            style={[
              styles.tutBarFill,
              {
                width: `${Math.min(100, (tutMs / plan.workDurationMs) * 100)}%`,
                backgroundColor: zone === 'above' ? colors.zoneAbove : colors.zoneIn,
              },
            ]}
          />
        </View>
      )}
      <Text style={styles.captionText}>{formatSeconds(tutMs)}</Text>

      <View style={styles.footerRow}>
        {band && <Text style={styles.footerText}>target {band.targetKg.toFixed(0)} kg</Text>}
        <Text style={styles.footerText}>⏱ {formatSeconds(elapsedMs)}</Text>
      </View>
    </View>
  )
}

function RestView({
  state,
  onSkip,
}: {
  state: ReturnType<typeof useSessionRunner>['state']
  onSkip: () => void
}) {
  const isHandSwap = state.phase === 'interHandRest'
  return (
    <View style={styles.centerFill}>
      <Text style={styles.restLabel}>{isHandSwap ? 'SWITCH HANDS' : 'REST'}</Text>
      <Text style={styles.countdownText}>{formatMinutesSeconds(state.remainingMs)}</Text>
      <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
        <Text style={styles.skipButtonText}>Skip</Text>
      </TouchableOpacity>
    </View>
  )
}

function DoneView({ onExit }: { onExit: () => void }) {
  return (
    <View style={styles.centerFill}>
      <Text style={styles.countdownText}>Done</Text>
      <TouchableOpacity style={styles.startButton} onPress={onExit}>
        <Text style={styles.startButtonText}>Finish</Text>
      </TouchableOpacity>
    </View>
  )
}

function DisconnectOverlay({
  onResume,
  onDiscard,
}: {
  onResume: () => void
  onDiscard: () => void
}) {
  return (
    <View style={styles.disconnectOverlay}>
      <Text style={styles.disconnectText}>Disconnected</Text>
      <View style={styles.disconnectButtons}>
        <TouchableOpacity style={styles.disconnectButton} onPress={onResume}>
          <Text style={styles.startButtonText}>Resume set</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.disconnectButtonSecondary} onPress={onDiscard}>
          <Text style={styles.footerText}>Discard and redo</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxxl,
  } as any,
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headerText: { ...typography.label, color: colors.textSecondary } as any,
  handIndicator: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  handDot: { width: 10, height: 10, borderRadius: 5 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  startButton: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  startButtonText: { ...typography.metricMedium, color: colors.bg, fontWeight: '700' } as any,
  countdownText: { ...typography.displayForce, color: colors.textPrimary } as any,
  captionText: { ...typography.label, color: colors.textTertiary } as any,
  restLabel: { ...typography.title, color: colors.textSecondary } as any,
  skipButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  skipButtonText: { ...typography.body, color: colors.accent } as any,
  workingContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  forceText: { ...typography.displayForce, color: colors.textPrimary } as any,
  unitText: { ...typography.label, color: colors.textTertiary, marginTop: -spacing.sm } as any,
  chartContainer: { width: '100%', flex: 1, marginVertical: spacing.lg },
  tutBarTrack: {
    width: '100%',
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  tutBarFill: { height: '100%', borderRadius: 8 },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: spacing.md,
  },
  footerText: { ...typography.body, color: colors.textSecondary } as any,
  abortButton: { alignSelf: 'center', paddingVertical: spacing.md, marginBottom: spacing.md },
  abortText: { ...typography.caption, color: colors.danger } as any,
  disconnectOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    opacity: 0.97,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  disconnectText: { ...typography.title, color: colors.danger } as any,
  disconnectButtons: { gap: spacing.md, alignItems: 'center' },
  disconnectButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  disconnectButtonSecondary: { paddingVertical: spacing.sm },
})
