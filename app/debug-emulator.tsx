import { useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { EmulatorDevice } from '../src/services/ble/EmulatorDevice'
import { sequences } from '../src/services/ble/sequences'
import type { DeviceStatus } from '../src/services/ble/DeviceSource'
import { colors, spacing, typography } from '../src/theme/tokens'

/**
 * Throwaway debug screen for Phase 1 — see docs/08-roadmap.md Phase 1
 * "done when": proves the emulator's five sequences actually drive live
 * numbers, without any of the real session UI (Phase 4/5) existing yet.
 *
 * Deliberately NOT in the tab bar — reachable only by direct navigation
 * (expo-router still resolves it at /debug-emulator) or from Settings once
 * that exists. Per docs/02-ble-protocol.md, the emulator stays behind a dev
 * flag and is never a user-facing "demo mode".
 */
export default function DebugEmulatorScreen() {
  const [sequenceId, setSequenceId] = useState<string>('steady-pull')
  const [forceKg, setForceKg] = useState(0)
  const [sampleCount, setSampleCount] = useState(0)
  const [status, setStatus] = useState<DeviceStatus>({ state: 'disconnected' })
  const deviceRef = useRef<EmulatorDevice | null>(null)

  useEffect(() => {
    return () => {
      deviceRef.current?.disconnect()
    }
  }, [])

  async function connect(id: string) {
    await deviceRef.current?.disconnect()
    setSampleCount(0)
    setForceKg(0)

    const device = new EmulatorDevice(id)
    deviceRef.current = device
    setSequenceId(id)

    device.onStatus(setStatus)
    device.onSample((sample) => {
      setForceKg(sample.forceKg)
      setSampleCount((n) => n + 1)
    })

    await device.connect()
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Debug: Emulator</Text>
      <Text style={styles.label}>Sequence</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
        {Object.keys(sequences).map((id) => (
          <TouchableOpacity
            key={id}
            onPress={() => connect(id)}
            style={[styles.pill, sequenceId === id && styles.pillActive]}
          >
            <Text style={[styles.pillText, sequenceId === id && styles.pillTextActive]}>{id}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.readoutBlock}>
        <Text style={styles.force}>{forceKg.toFixed(1)}</Text>
        <Text style={styles.unit}>kg</Text>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.stat}>samples: {sampleCount}</Text>
        <Text style={styles.stat}>status: {status.state}</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg } as any,
  label: { ...typography.label, color: colors.textTertiary, marginBottom: spacing.sm } as any,
  pillRow: { flexGrow: 0, marginBottom: spacing.xl },
  pill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { ...typography.body, color: colors.textSecondary } as any,
  pillTextActive: { color: colors.bg },
  readoutBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
  },
  force: { ...typography.displayForce, color: colors.textPrimary } as any,
  unit: { ...typography.label, color: colors.textTertiary } as any,
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stat: { ...typography.body, color: colors.textSecondary } as any,
})
