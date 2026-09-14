import { PropsWithChildren } from 'react'
import { StyleSheet, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, typography } from './tokens'

// Placeholder scaffold for a screen not yet built — Phase 0 exists to prove
// navigation and the theme work, not to build real screens. Each tab's real
// content lands in its own roadmap phase (see docs/08-roadmap.md).
export function Screen({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  } as any,
})
