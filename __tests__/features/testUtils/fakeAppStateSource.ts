import type { AppStateSource } from '../../../src/features/session/useSessionRunner'

/**
 * Fake AppState — the real one is backed by NativeEventEmitter, which
 * can't be constructed under Jest. Gives tests direct control over firing
 * a 'change' event, matching the same narrow-fake pattern as
 * fakeBleManager.ts / fakeDeviceSource.ts.
 */
export class FakeAppStateSource implements AppStateSource {
  private listener:
    ((state: 'active' | 'background' | 'inactive' | 'unknown' | 'extension') => void) | null = null
  removeCalled = false

  addEventListener(
    _type: 'change',
    listener: (state: 'active' | 'background' | 'inactive' | 'unknown' | 'extension') => void,
  ) {
    this.listener = listener
    return { remove: () => (this.removeCalled = true) }
  }

  emit(state: 'active' | 'background' | 'inactive' | 'unknown' | 'extension') {
    this.listener?.(state)
  }
}
