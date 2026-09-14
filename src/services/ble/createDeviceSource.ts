import type { BleManager } from 'react-native-ble-plx'
import type { DeviceSource } from './DeviceSource'
import { ProgressorDevice } from './ProgressorDevice'
import { WHC06Device } from './WHC06Device'
import { EmulatorDevice } from './EmulatorDevice'

export type DeviceSourceSpec =
  | { kind: 'progressor'; bleDeviceId: string }
  | { kind: 'whc06' }
  | { kind: 'emulator'; sequenceId: string }

/**
 * Single place that turns a device choice into a concrete DeviceSource —
 * the Device screen (docs/04-screens-and-ux.md) and, later, the session
 * runner (Phase 4/5) both go through this rather than constructing device
 * classes directly, so device selection stays a data decision, not a
 * branch scattered through the UI.
 */
export function createDeviceSource(manager: BleManager, spec: DeviceSourceSpec): DeviceSource {
  switch (spec.kind) {
    case 'progressor':
      return new ProgressorDevice(manager, spec.bleDeviceId)
    case 'whc06':
      return new WHC06Device(manager)
    case 'emulator':
      return new EmulatorDevice(spec.sequenceId)
  }
}
