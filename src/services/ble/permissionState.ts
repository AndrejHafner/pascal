// Pure decision logic for what the Device screen should show given the
// current Bluetooth/location permission state — see
// docs/04-screens-and-ux.md "Permission handling": "The Device screen must
// distinguish and give actionable copy for [specific cases]. A generic
// 'connection failed' is not acceptable." Kept separate from the actual
// OS permission calls (PermissionsAndroid, BleManager.state()) so this
// mapping is unit-testable without a native module.

export type BluetoothPowerState =
  'unknown' | 'unsupported' | 'unauthorized' | 'poweredOff' | 'poweredOn'

export type AndroidPermissionState = 'granted' | 'denied' | 'never_ask_again' | 'not_applicable'

export interface PermissionCheckInput {
  platform: 'ios' | 'android'
  bluetoothPower: BluetoothPowerState
  /** Android 12+ runtime permission; not_applicable on iOS or older Android. */
  bluetoothScanPermission: AndroidPermissionState
  bluetoothConnectPermission: AndroidPermissionState
  /** Android's scan API requires location services on, pre-Android 12 scan permission model. */
  locationServicesEnabled: boolean
}

export type PermissionUiState =
  | { status: 'ready' }
  | { status: 'bluetooth_unsupported'; message: string }
  | { status: 'bluetooth_off'; message: string }
  | { status: 'permission_denied'; message: string; canRequestAgain: true }
  | { status: 'permission_denied_permanently'; message: string; deepLinkToSettings: true }
  | { status: 'location_services_off'; message: string }
  | { status: 'unknown'; message: string }

/**
 * Maps raw platform/permission state to one actionable UI state. Every
 * branch here corresponds to a specific case doc 04 requires distinct,
 * actionable copy for.
 */
export function resolvePermissionUiState(input: PermissionCheckInput): PermissionUiState {
  if (input.bluetoothPower === 'unsupported') {
    return {
      status: 'bluetooth_unsupported',
      message: 'This device does not support Bluetooth Low Energy.',
    }
  }

  if (input.bluetoothPower === 'unknown') {
    return { status: 'unknown', message: 'Checking Bluetooth status…' }
  }

  if (input.platform === 'android') {
    if (
      input.bluetoothScanPermission === 'never_ask_again' ||
      input.bluetoothConnectPermission === 'never_ask_again'
    ) {
      return {
        status: 'permission_denied_permanently',
        message:
          'Bluetooth permission was denied. Enable it in Settings to connect to your device.',
        deepLinkToSettings: true,
      }
    }
    if (
      input.bluetoothScanPermission === 'denied' ||
      input.bluetoothConnectPermission === 'denied'
    ) {
      return {
        status: 'permission_denied',
        message: 'Pascal needs Bluetooth permission to scan for your force device.',
        canRequestAgain: true,
      }
    }
    if (!input.locationServicesEnabled) {
      return {
        status: 'location_services_off',
        message:
          'Turn on Location Services to scan for Bluetooth devices — Android requires this for BLE scanning, even though Pascal does not use your location.',
      }
    }
  }

  if (input.bluetoothPower === 'unauthorized') {
    return {
      status: 'permission_denied_permanently',
      message: 'Bluetooth permission was denied. Enable it in Settings to connect to your device.',
      deepLinkToSettings: true,
    }
  }

  if (input.bluetoothPower === 'poweredOff') {
    return { status: 'bluetooth_off', message: 'Turn on Bluetooth to connect to your device.' }
  }

  return { status: 'ready' }
}
