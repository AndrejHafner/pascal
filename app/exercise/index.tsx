import { useCallback, useEffect, useState } from 'react'
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useRepositories } from '../../src/services/db/useRepositories'
import type { Exercise, Modality } from '../../src/core/types'
import { colors, spacing, typography } from '../../src/theme/tokens'

/**
 * Exercise list / editor — see docs/04-screens-and-ux.md "Screen
 * inventory": "Manage exercises (name, grip, edge depth, modality)." A
 * small user-defined set is enough for v1, per docs/03 — not a public
 * exercise library.
 */
export default function ExerciseListScreen() {
  const router = useRouter()
  const repos = useRepositories()
  const [exercises, setExercises] = useState<Exercise[] | null>(null)
  const [showForm, setShowForm] = useState(false)

  const reload = useCallback(async () => {
    if (!repos) return
    setExercises(await repos.exercises.listAll())
  }, [repos])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!repos) return
      const list = await repos.exercises.listAll()
      if (!cancelled) setExercises(list)
    })()
    return () => {
      cancelled = true
    }
  }, [repos])

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Exercises</Text>
        <TouchableOpacity onPress={() => setShowForm((v) => !v)}>
          <Text style={styles.addLink}>{showForm ? 'Cancel' : '+ Add'}</Text>
        </TouchableOpacity>
      </View>

      {showForm && repos && (
        <NewExerciseForm
          onCreated={async () => {
            setShowForm(false)
            await reload()
          }}
        />
      )}

      <FlatList
        data={exercises ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !showForm ? (
            <Text style={styles.emptyText}>No exercises yet. Add one to start a session.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })}
          >
            <Text style={styles.rowTitle}>{item.name}</Text>
            <Text style={styles.rowSubtitle}>
              {item.gripType} · {item.edgeDepthMm}mm · {item.modality.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  )
}

function NewExerciseForm({ onCreated }: { onCreated: () => void }) {
  const repos = useRepositories()
  const [name, setName] = useState('')
  const [gripType, setGripType] = useState('')
  const [edgeDepthMm, setEdgeDepthMm] = useState('')
  const [modality, setModality] = useState<Modality>('block_pull')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!repos) return
    const edgeDepth = Number(edgeDepthMm)
    if (!name.trim()) return setError('Name is required.')
    if (!gripType.trim()) return setError('Grip type is required.')
    // Edge depth is not optional metadata — comparing maxes across
    // different edge depths is invalid, per docs/03.
    if (!edgeDepthMm || !Number.isFinite(edgeDepth) || edgeDepth <= 0) {
      return setError('Edge depth (mm) is required.')
    }

    await repos.exercises.create({
      name: name.trim(),
      gripType: gripType.trim(),
      edgeDepthMm: edgeDepth,
      modality,
      notes: null,
    })
    onCreated()
  }

  return (
    <View style={styles.form}>
      <TextInput
        style={styles.input}
        placeholder="Name (e.g. Block Pull)"
        placeholderTextColor={colors.textTertiary}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Grip type (e.g. half-crimp)"
        placeholderTextColor={colors.textTertiary}
        value={gripType}
        onChangeText={setGripType}
      />
      <TextInput
        style={styles.input}
        placeholder="Edge depth (mm)"
        placeholderTextColor={colors.textTertiary}
        value={edgeDepthMm}
        onChangeText={setEdgeDepthMm}
        keyboardType="numeric"
      />
      <View style={styles.modalityRow}>
        {(['block_pull', 'hang'] as Modality[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.modalityPill, modality === m && styles.modalityPillActive]}
            onPress={() => setModality(m)}
          >
            <Text style={styles.modalityPillText}>{m.replace('_', ' ')}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
      <TouchableOpacity style={styles.submitButton} onPress={submit}>
        <Text style={styles.submitButtonText}>Save exercise</Text>
      </TouchableOpacity>
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
    paddingVertical: spacing.md,
  },
  title: { ...typography.title, color: colors.textPrimary } as any,
  addLink: { ...typography.body, color: colors.accent } as any,
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  } as any,
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600' } as any,
  rowSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 } as any,
  form: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  } as any,
  modalityRow: { flexDirection: 'row', gap: spacing.sm },
  modalityPill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalityPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modalityPillText: { ...typography.body, color: colors.textSecondary } as any,
  errorText: { ...typography.caption, color: colors.danger } as any,
  submitButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  submitButtonText: { ...typography.body, color: colors.bg, fontWeight: '600' } as any,
})
