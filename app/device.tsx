import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BleManager } from 'react-native-ble-plx'
import { createDeviceSource, type DeviceSourceSpec } from '../src/services/ble/createDeviceSource'
import { ProgressorDevice } from '../src/services/ble/ProgressorDevice'
import { usePermissionState } from '../src/services/ble/usePermissionState'
import type { DeviceSource, DeviceStatus } from '../src/services/ble/DeviceSource'
import { sequences } from '../src/services/ble/sequences'
import { colors, spacing, typography } from '../src/theme/tokens'

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
  const [sampleCount, setSampleCount] = useState(0)
  const [battery, setBattery] = useState<number | null>(null)
  const firstSampleAt = useRef<number | null>(null)
  const [observedHz, setObservedHz] = useState<number | null>(null)

  const [scanning, setScanning] = useState(false)
  const [progressorCandidates, setProgressorCandidates] = useState<{ id: string; name: string }[]>(
    [],
  )

  useEffect(() => {
    return () => {
      deviceRef.current?.disconnect()
      manager.stopDeviceScan()
    }
  }, [manager])

  function scanForProgressor() {
    setProgressorCandidates([])
    setScanning(true)
    manager.startDeviceScan(null, null, (error, scannedDevice) => {
      if (error) {
        setScanning(false)
        return
      }
      if (!scannedDevice || !ProgressorDevice.nameMatches(scannedDevice.name)) return
      setProgressorCandidates((prev) =>
        prev.some((d) => d.id === scannedDevice.id)
          ? prev
          : [...prev, { id: scannedDevice.id, name: scannedDevice.name ?? 'Progressor' }],
      )
    })
    setTimeout(() => {
      manager.stopDeviceScan()
      setScanning(false)
    }, 10_000)
  }

  async function connectTo(spec: DeviceSourceSpec) {
    manager.stopDeviceScan()
    setScanning(false)
    await deviceRef.current?.disconnect()
    setSampleCount(0)
    setForceKg(0)
    setBattery(null)
    setObservedHz(null)
    firstSampleAt.current = null

    const device = createDeviceSource(manager, spec)
    deviceRef.current = device

    device.onStatus(setStatus)
    device.onSample((sample) => {
      setForceKg(sample.forceKg)
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
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView>
        <Text style={styles.title}>Device</Text>

        <View style={styles.readoutBlock}>
          <Text style={styles.force}>{forceKg.toFixed(1)}</Text>
          <Text style={styles.unit}>kg</Text>
        </View>

        <View style={styles.statsRow}>
          <Text style={styles.stat}>status: {status.state}</Text>
          <Text style={styles.stat}>samples: {sampleCount}</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.stat}>
            observed rate: {observedHz ? `${observedHz.toFixed(1)} Hz` : '—'}
          </Text>
          <Text style={styles.stat}>battery: {battery !== null ? `${battery} mV` : '—'}</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, status.state !== 'connected' && styles.buttonDisabled]}
          onPress={handleTare}
          disabled={status.state !== 'connected'}
        >
          <Text style={styles.buttonText}>Tare</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Tindeq Progressor</Text>
        <TouchableOpacity style={styles.button} onPress={scanForProgressor} disabled={scanning}>
          <Text style={styles.buttonText}>{scanning ? 'Scanning…' : 'Scan'}</Text>
        </TouchableOpacity>
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
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  stat: { ...typography.body, color: colors.textSecondary } as any,
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
