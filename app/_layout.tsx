import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as ScreenOrientation from 'expo-screen-orientation'
import { colors } from '../src/theme/tokens'

// Portrait only, locked app-wide — see docs/04-screens-and-ux.md
// "Accessibility & practical constraints". No landscape layouts, no
// mid-set rotation.
export default function RootLayout() {
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
  }, [])

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="session/live" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </>
  )
}
