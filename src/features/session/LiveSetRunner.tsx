import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSessionRunner } from './useSessionRunner'
import type { SessionRunnerConfig, SessionRunnerDeps } from './useSessionRunner'
import { ForceChart } from '../chart/ForceChart'
import { formatSeconds, formatMinutesSeconds } from './formatDuration'
import { computeTut } from '../../core/metrics/tut'
import type { Zone } from '../../core/metrics/zone'
import { colors, spacing, typography } from '../../theme/tokens'

/**
 * Runs ONE TrainingSet (one attempt/set within a SessionStep) through the
 * full live UI: countdown -> armed -> working -> rest -> done. See
 * docs/04-screens-and-ux.md "Live session — the core screen".
 *
 * Extracted from app/session/live.tsx (Phase 4) so it can be mounted
 * per-set by the multi-step orchestrator (Phase 5) with a stable `key`
 * per TrainingSet id — useSessionRunner's internal machine state is
 * initialized once via useState's lazy initializer and does not reset on
 * prop changes, so a fresh mount per set is what actually resets it, not
 * a config change alone. See useStepRunner.ts for the same note.
 */
export function LiveSetRunner({
  config,
  deps,
  setLabel,
  onDone,
}: {
  config: SessionRunnerConfig
  deps: SessionRunnerDeps
  /** e.g. "Attempt 2/3" or "Set 4/5" — the step runner knows which. */
  setLabel: string
  onDone: () => void
}) {
  const runner = useSessionRunner(config, deps)
  const { state } = runner
  const isDisconnected =
    runner.deviceStatus.state === 'disconnected' && state.phase === 'interrupted'

  useEffect(() => {
    if (state.phase === 'done') onDone()
  }, [state.phase, onDone])

  return (
    <View style={styles.container}>
      <SetHandHeader state={state} setLabel={setLabel} />

      {state.phase === 'idle' && <StartPrompt onStart={runner.start} />}

      {(state.phase === 'countdown' || state.phase === 'armed') && <CountdownView state={state} />}

      {state.phase === 'working' && (
        <WorkingView
          workDurationMs={config.plan.workDurationMs}
          band={config.band}
          liveBuffer={runner.liveBuffer}
        />
      )}

      {(state.phase === 'interHandRest' || state.phase === 'setRest') && (
        <RestView state={state} onSkip={runner.skip} />
      )}

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
    </View>
  )
}

function SetHandHeader({
  state,
  setLabel,
}: {
  state: ReturnType<typeof useSessionRunner>['state']
  setLabel: string
}) {
  const hand = state.plan.hands[state.handIndex % state.plan.hands.length]
  const handColor = hand === 'left' ? colors.handLeft : colors.handRight
  return (
    <View style={styles.header}>
      <Text style={styles.headerText}>{setLabel}</Text>
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
  workDurationMs,
  band,
  liveBuffer,
}: {
  workDurationMs: number
  band: SessionRunnerConfig['band']
  liveBuffer: ReturnType<typeof useSessionRunner>['liveBuffer']
}) {
  const [forceKg, setForceKg] = useState(0)
  const [zone, setZone] = useState<Zone | null>(null)
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
                width: `${Math.min(100, (tutMs / workDurationMs) * 100)}%`,
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
