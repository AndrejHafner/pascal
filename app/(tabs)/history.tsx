import { Text, StyleSheet } from 'react-native'
import { Screen } from '../../src/theme/Screen'
import { colors, typography } from '../../src/theme/tokens'

// History — reverse-chronological session list. See
// docs/04-screens-and-ux.md "History & Session detail". Real content lands
// in Phase 6 — see docs/08-roadmap.md.
export default function HistoryScreen() {
  return (
    <Screen title="History">
      <Text style={styles.body}>Phase 0 scaffold — session history lands in Phase 6.</Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { ...typography.body, color: colors.textSecondary } as any,
})
