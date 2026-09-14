import { useCallback, useEffect, useState } from 'react'
import { Platform, PermissionsAndroid } from 'react-native'
import type { BleManager } from 'react-native-ble-plx'
import {
  resolvePermissionUiState,
  type AndroidPermissionState,
  type BluetoothPowerState,
  type PermissionUiState,
} from './permissionState'

/**
 * Bridges the actual platform/native permission APIs into the pure
 * resolvePermissionUiState decision function. Android location-services
 * detection is deliberately NOT implemented here yet — ble-plx has no
 * direct API for it and it requires a native check
 * (react-native-location-enabler or similar); the location_services_off
 * branch in permissionState.ts stays reachable and tested, but this hook
 * always reports locationServicesEnabled: true until that's wired up.
 * Tracked as a Phase 4/5 follow-up, not a Phase 2 blocker.
 */
export function usePermissionState(manager: BleManager): {
  state: PermissionUiState
  requestPermissions: () => Promise<void>
} {
  const [bluetoothPower, setBluetoothPower] = useState<BluetoothPowerState>('unknown')
  const [scanPermission, setScanPermission] = useState<AndroidPermissionState>(
    Platform.OS === 'android' ? 'denied' : 'not_applicable',
  )
  const [connectPermission, setConnectPermission] = useState<AndroidPermissionState>(
    Platform.OS === 'android' ? 'denied' : 'not_applicable',
  )

  useEffect(() => {
    const subscription = manager.onStateChange((nativeState) => {
      setBluetoothPower(mapNativeState(nativeState))
    }, true)
    return () => subscription.remove()
  }, [manager])

  const requestPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') return

    const results = await PermissionsAndroid.requestMultiple([
      'android.permission.BLUETOOTH_SCAN' as never,
      'android.permission.BLUETOOTH_CONNECT' as never,
    ])

    setScanPermission(mapAndroidResult(results['android.permission.BLUETOOTH_SCAN' as never]))
    setConnectPermission(mapAndroidResult(results['android.permission.BLUETOOTH_CONNECT' as never]))
  }, [])

  useEffect(() => {
    // requestPermissions is async — its setState calls run after an await,
    // in a resolved-promise microtask, not synchronously within this effect
    // body, so this isn't the cascading-render pattern the lint rule guards
    // against. Wrapped in `void` + an inner async fn so the effect itself
    // stays a plain (non-Promise-returning) callback.
    let cancelled = false
    void (async () => {
      await requestPermissions()
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
    // Only on mount — requestPermissions is stable (useCallback([])), and
    // re-requesting happens explicitly via the returned requestPermissions()
    // e.g. from a "grant permission" button, not by re-running this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const state = resolvePermissionUiState({
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    bluetoothPower,
    bluetoothScanPermission: scanPermission,
    bluetoothConnectPermission: connectPermission,
    locationServicesEnabled: true, // see follow-up note above
  })

  return { state, requestPermissions }
}

function mapNativeState(state: string): BluetoothPowerState {
  switch (state) {
    case 'PoweredOn':
      return 'poweredOn'
    case 'PoweredOff':
      return 'poweredOff'
    case 'Unauthorized':
      return 'unauthorized'
    case 'Unsupported':
      return 'unsupported'
    default:
      return 'unknown'
  }
}

function mapAndroidResult(
  result: 'granted' | 'denied' | 'never_ask_again' | undefined,
): AndroidPermissionState {
  if (result === 'granted') return 'granted'
  if (result === 'never_ask_again') return 'never_ask_again'
  return 'denied'
}
