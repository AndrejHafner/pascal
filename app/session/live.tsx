import { Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, typography } from '../../src/theme/tokens'

// Live session — the core screen. Runs the whole session state machine:
// countdown -> working -> inter-hand rest -> working -> set rest -> next set.
// See docs/04-screens-and-ux.md "Live session" and docs/07-architecture.md
// "Session state machine". Built in Phase 4 — see docs/08-roadmap.md.
export default function LiveSessionScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.body}>
        Phase 0 scaffold — the live session state machine lands in Phase 4.
      </Text>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  body: { ...typography.body, color: colors.textSecondary, textAlign: 'center' } as any,
})
