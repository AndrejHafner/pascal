import {
  resolvePermissionUiState,
  type PermissionCheckInput,
} from '../../src/services/ble/permissionState'

const baseInput: PermissionCheckInput = {
  platform: 'ios',
  bluetoothPower: 'poweredOn',
  bluetoothScanPermission: 'not_applicable',
  bluetoothConnectPermission: 'not_applicable',
  locationServicesEnabled: true,
}

// Every case here corresponds to a distinct, actionable state
// docs/04-screens-and-ux.md "Permission handling" requires — "a generic
// 'connection failed' is not acceptable."
describe('resolvePermissionUiState', () => {
  it('is ready when everything is fine', () => {
    expect(resolvePermissionUiState(baseInput)).toEqual({ status: 'ready' })
  })

  it('reports unsupported hardware distinctly from any permission issue', () => {
    const result = resolvePermissionUiState({ ...baseInput, bluetoothPower: 'unsupported' })
    expect(result.status).toBe('bluetooth_unsupported')
  })

  it('reports Bluetooth off distinctly from a permission denial', () => {
    const result = resolvePermissionUiState({ ...baseInput, bluetoothPower: 'poweredOff' })
    expect(result.status).toBe('bluetooth_off')
  })

  it('reports "checking" while power state is still unknown, not a false error', () => {
    const result = resolvePermissionUiState({ ...baseInput, bluetoothPower: 'unknown' })
    expect(result.status).toBe('unknown')
  })

  it('iOS unauthorized maps to the permanently-denied deep-link case', () => {
    const result = resolvePermissionUiState({ ...baseInput, bluetoothPower: 'unauthorized' })
    expect(result.status).toBe('permission_denied_permanently')
    expect((result as { deepLinkToSettings: boolean }).deepLinkToSettings).toBe(true)
  })

  it('Android: a plain denial is distinguished from permanent denial (never_ask_again)', () => {
    const denied = resolvePermissionUiState({
      ...baseInput,
      platform: 'android',
      bluetoothScanPermission: 'denied',
      bluetoothConnectPermission: 'granted',
    })
    expect(denied.status).toBe('permission_denied')
    expect((denied as { canRequestAgain: boolean }).canRequestAgain).toBe(true)

    const permanentlyDenied = resolvePermissionUiState({
      ...baseInput,
      platform: 'android',
      bluetoothScanPermission: 'never_ask_again',
      bluetoothConnectPermission: 'granted',
    })
    expect(permanentlyDenied.status).toBe('permission_denied_permanently')
  })

  it('Android: either scan or connect permission being denied is enough to block', () => {
    const connectDenied = resolvePermissionUiState({
      ...baseInput,
      platform: 'android',
      bluetoothScanPermission: 'granted',
      bluetoothConnectPermission: 'denied',
    })
    expect(connectDenied.status).toBe('permission_denied')
  })

  it('Android: location services off is reported distinctly, with an explanation', () => {
    const result = resolvePermissionUiState({
      ...baseInput,
      platform: 'android',
      bluetoothScanPermission: 'granted',
      bluetoothConnectPermission: 'granted',
      locationServicesEnabled: false,
    })
    expect(result.status).toBe('location_services_off')
    expect((result as { message: string }).message).toMatch(/location/i)
  })

  it('iOS never checks Android-only location services', () => {
    const result = resolvePermissionUiState({
      ...baseInput,
      platform: 'ios',
      locationServicesEnabled: false,
    })
    expect(result.status).toBe('ready')
  })

  it('permission checks take priority over location services on Android', () => {
    const result = resolvePermissionUiState({
      ...baseInput,
      platform: 'android',
      bluetoothScanPermission: 'denied',
      bluetoothConnectPermission: 'granted',
      locationServicesEnabled: false,
    })
    expect(result.status).toBe('permission_denied')
  })
})
