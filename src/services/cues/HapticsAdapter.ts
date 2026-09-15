// Thin wrapper over expo-haptics — exists so CuePlayer can be constructed
// with a fake in tests (expo-haptics is a native module and can't run
// under Jest, same reason services/ble/DeviceSource.ts takes its manager
// as a constructor parameter rather than importing react-native-ble-plx
// directly).

import * as Haptics from 'expo-haptics'

export type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
export type NotificationStyle = 'success' | 'warning' | 'error'

export interface HapticsAdapter {
  impact(style: ImpactStyle): Promise<void>
  notification(style: NotificationStyle): Promise<void>
  selection(): Promise<void>
}

const IMPACT_STYLE_MAP: Record<ImpactStyle, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
  rigid: Haptics.ImpactFeedbackStyle.Rigid,
  soft: Haptics.ImpactFeedbackStyle.Soft,
}

const NOTIFICATION_STYLE_MAP: Record<NotificationStyle, Haptics.NotificationFeedbackType> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
}

export const expoHapticsAdapter: HapticsAdapter = {
  impact: (style) => Haptics.impactAsync(IMPACT_STYLE_MAP[style]),
  notification: (style) => Haptics.notificationAsync(NOTIFICATION_STYLE_MAP[style]),
  selection: () => Haptics.selectionAsync(),
}
