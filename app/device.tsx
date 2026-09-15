import { useEffect, useMemo, useRef, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BleManager } from 'react-native-ble-plx'
import { createDeviceSource, type DeviceSourceSpec } from '../src/services/ble/createDeviceSource'
import { ProgressorDevice } from '../src/services/ble/ProgressorDevice'
import { usePermissionState } from '../src/services/ble/usePermissionState'
import type { DeviceSource, DeviceStatus } from '../src/services/ble/DeviceSource'
import { sequences } from '../src/services/ble/sequences'
import { colors, spacing, typography } from '../src/theme/tokens'

/**
 * Tindeq Progressor's low-battery cutoff isn't documented (docs/02 has no
 * voltage thresholds) — 3400mV is a conservative single-cell Li-ion
 * "getting low" line (full ~4200mV), chosen to warn with real time left
 * to charge before a session, not right as the device dies mid-set.
 * Revisit once Phase H's real-hardware battery behavior is observed.
 */
const LOW_BATTERY_MV = 3400

type ScanState = 'idle' | 'scanning' | 'nothing_found'

/**
 * Device screen — scan, connect, live readout, tare, battery, observed
 * sample rate. See docs/04-screens-and-ux.md "Connection UX (Device
 * screen)". Built to docs/08-roadmap.md Phase 2 scope: reaches every real
 * device class's connect/tare/sample/battery path and works end-to-end
 * against EmulatorDevice. Remembered-device auto-reconnect and a polished
 * candidate list (signal strength, etc.) are Phase 4/5 UI work — this is
 * the minimum real "scan → tap → connect" flow, not the final UX.
 */
export default function DeviceScreen() {
  const manager = useMemo(() => new BleManager(), [])
  useEffect(() => {
    return () => {
      manager.destroy()
    }
  }, [manager])

  const { state: permissionState, requestPermissions } = usePermissionState(manager)

  const deviceRef = useRef<DeviceSource | null>(null)
  const [status, setStatus] = useState<DeviceStatus>({ state: 'disconnected' })
  const [forceKg, setForceKg] = useState(0)
  const [sawNegativeForce, setSawNegativeForce] = useState(false)
  const [sampleCount, setSampleCount] = useState(0)
  const [battery, setBattery] = useState<number | null>(null)
  const firstSampleAt = useRef<number | null>(null)
  const [observedHz, setObservedHz] = useState<number | null>(null)

  const [scanState, setScanState] = useState<ScanState>('idle')
  const [progressorCandidates, setProgressorCandidates] = useState<{ id: string; name: string }[]>(
    [],
  )
  const candidateCountRef = useRef(0)

  useEffect(() => {
    return () => {
      deviceRef.current?.disconnect()
      manager.stopDeviceScan()
    }
  }, [manager])

  function scanForProgressor() {
    setProgressorCandidates([])
    candidateCountRef.current = 0
    setScanState('scanning')
    manager.startDeviceScan(null, null, (error, scannedDevice) => {
      if (error) {
        setScanState('idle')
        return
      }
      if (!scannedDevice || !ProgressorDevice.nameMatches(scannedDevice.name)) return
      setProgressorCandidates((prev) => {
        if (prev.some((d) => d.id === scannedDevice.id)) return prev
        const next = [...prev, { id: scannedDevice.id, name: scannedDevice.name ?? 'Progressor' }]
        candidateCountRef.current = next.length
        return next
      })
    })
    setTimeout(() => {
      manager.stopDeviceScan()
      // "still scanning" vs "nothing found" per docs/04 — only the
      // zero-candidates case gets the dedicated nothing_found copy; if
      // something was found, the pill list already communicates that, so
      // the scan state just goes back to idle (re-scannable).
      setScanState(candidateCountRef.current === 0 ? 'nothing_found' : 'idle')
    }, 10_000)
  }

  async function connectTo(spec: DeviceSourceSpec) {
    manager.stopDeviceScan()
    setScanState('idle')
    await deviceRef.current?.disconnect()
    setSampleCount(0)
    setForceKg(0)
    setSawNegativeForce(false)
    setBattery(null)
    setObservedHz(null)
    firstSampleAt.current = null

    const device = createDeviceSource(manager, spec)
    deviceRef.current = device

    device.onStatus(setStatus)
    device.onSample((sample) => {
      // docs/04 "Force reads negative": possible on Progressor (sign flips
      // with direction). Clamp what's DISPLAYED, not the underlying
      // reading itself — this is a display-only guard, so tare/logic
      // elsewhere still sees the real signed value.
      setForceKg(sample.forceKg)
      if (sample.forceKg < 0) setSawNegativeForce(true)
      setSampleCount((n) => {
        const next = n + 1
        const now = Date.now()
        if (firstSampleAt.current === null) firstSampleAt.current = now
        const elapsedS = (now - firstSampleAt.current) / 1000
        if (elapsedS > 0.5) setObservedHz(next / elapsedS)
        return next
      })
    })

    await device.connect()

    if (device.capabilities.battery && device.getBattery) {
      device
        .getBattery()
        .then(setBattery)
        .catch(() => setBattery(null))
    }
  }

  async function handleTare() {
    await deviceRef.current?.tare()
    setSawNegativeForce(false)
  }

  if (permissionState.status !== 'ready') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Text style={styles.title}>Device</Text>
        <View style={styles.permissionBlock}>
          <Text style={styles.permissionMessage}>{permissionState.message}</Text>
          {'canRequestAgain' in permissionState && (
            <TouchableOpacity style={styles.button} onPress={requestPermissions}>
              <Text style={styles.buttonText}>Grant permission</Text>
            </TouchableOpacity>
          )}
          {'deepLinkToSettings' in permissionState && (
            <TouchableOpacity style={styles.button} onPress={() => Linking.openSettings()}>
              <Text style={styles.buttonText}>Open Settings</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView>
        <Text style={styles.title}>Device</Text>

        <View style={styles.readoutBlock}>
          {/* Display-only clamp per docs/04 "Force reads negative" — the
              underlying sample and tare() still see the real signed value. */}
          <Text style={styles.force}>{Math.max(0, forceKg).toFixed(1)}</Text>
          <Text style={styles.unit}>kg</Text>
          {sawNegativeForce && (
            <Text style={styles.negativeForceHint}>Reading negative — try Tare below</Text>
          )}
        </View>

        <View style={styles.statsRow}>
          <Text style={styles.stat}>status: {status.state}</Text>
          <Text style={styles.stat}>samples: {sampleCount}</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.stat}>
            observed rate: {observedHz ? `${observedHz.toFixed(1)} Hz` : '—'}
          </Text>
          <Text
            style={[
              styles.stat,
              battery !== null && battery < LOW_BATTERY_MV && styles.statWarning,
            ]}
          >
            battery: {battery !== null ? `${battery} mV` : '—'}
            {battery !== null && battery < LOW_BATTERY_MV ? ' (low)' : ''}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, status.state !== 'connected' && styles.buttonDisabled]}
          onPress={handleTare}
          disabled={status.state !== 'connected'}
        >
          <Text style={styles.buttonText}>Tare</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Tindeq Progressor</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={scanForProgressor}
          disabled={scanState === 'scanning'}
        >
          <Text style={styles.buttonText}>{scanState === 'scanning' ? 'Scanning…' : 'Scan'}</Text>
        </TouchableOpacity>
        {scanState === 'nothing_found' && (
          <Text style={styles.scanHint}>
            No Progressor found. Make sure it&rsquo;s powered and nearby — it sleeps after a period
            of inactivity, so a quick squeeze may wake it before scanning again.
          </Text>
        )}
        {progressorCandidates.map((candidate) => (
          <TouchableOpacity
            key={candidate.id}
            style={styles.pill}
            onPress={() => connectTo({ kind: 'progressor', bleDeviceId: candidate.id })}
          >
            <Text style={styles.pillText}>{candidate.name}</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Weiheng WH-C06</Text>
        <TouchableOpacity style={styles.pill} onPress={() => connectTo({ kind: 'whc06' })}>
          <Text style={styles.pillText}>Scan (advertisement-based, no pairing)</Text>
        </TouchableOpacity>

        {__DEV__ && (
          <>
            <Text style={styles.label}>Emulator (dev only)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {Object.keys(sequences).map((id) => (
                <TouchableOpacity
                  key={id}
                  style={styles.pill}
                  onPress={() => connectTo({ kind: 'emulator', sequenceId: id })}
                >
                  <Text style={styles.pillText}>{id}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg } as any,
  label: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  } as any,
  readoutBlock: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  force: { ...typography.displayForce, color: colors.textPrimary } as any,
  unit: { ...typography.label, color: colors.textTertiary } as any,
  negativeForceHint: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.sm,
  } as any,
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  stat: { ...typography.body, color: colors.textSecondary } as any,
  statWarning: { color: colors.warning } as any,
  scanHint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  } as any,
  button: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...typography.body, color: colors.bg, fontWeight: '600' } as any,
  pill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginTop: spacing.sm,
  },
  pillText: { ...typography.body, color: colors.textSecondary } as any,
  permissionBlock: { paddingVertical: spacing.xxxl },
  permissionMessage: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  } as any,
})
