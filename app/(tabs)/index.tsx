import { Text, StyleSheet } from 'react-native'
import { Screen } from '../../src/theme/Screen'
import { colors, typography } from '../../src/theme/tokens'

// Today — entry point. Device status, start a session, recent activity.
// See docs/04-screens-and-ux.md "Screen inventory". Real content lands in
// Phase 1 (data layer) and Phase 5 (full session flow) — see docs/08-roadmap.md.
export default function TodayScreen() {
  return (
    <Screen title="Today">
      <Text style={styles.body}>Phase 0 scaffold — session setup lands in Phase 5.</Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { ...typography.body, color: colors.textSecondary } as any,
})
