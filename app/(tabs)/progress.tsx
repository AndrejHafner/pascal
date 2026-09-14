import { Text, StyleSheet } from 'react-native'
import { Screen } from '../../src/theme/Screen'
import { colors, typography } from '../../src/theme/tokens'

// Progress — max progression, asymmetry trend, training load over time.
// See docs/04-screens-and-ux.md "Progress". Real content lands in Phase 6 —
// see docs/08-roadmap.md.
export default function ProgressScreen() {
  return (
    <Screen title="Progress">
      <Text style={styles.body}>Phase 0 scaffold — progress charts land in Phase 6.</Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { ...typography.body, color: colors.textSecondary } as any,
})
