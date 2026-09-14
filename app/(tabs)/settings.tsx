import { Text, StyleSheet } from 'react-native'
import { Screen } from '../../src/theme/Screen'
import { colors, typography } from '../../src/theme/tokens'

// Settings — bodyweight, units, cue preferences, thresholds, export, about.
// See docs/04-screens-and-ux.md "Screen inventory". Real content lands
// alongside the features that need each setting (Phase 4 cues, Phase 5
// bodyweight, Phase 7 export) — see docs/08-roadmap.md.
export default function SettingsScreen() {
  return (
    <Screen title="Settings">
      <Text style={styles.body}>
        Phase 0 scaffold — settings land alongside the features that need them.
      </Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { ...typography.body, color: colors.textSecondary } as any,
})
