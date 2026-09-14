/** One point in a canned emulator sequence — see docs/02-ble-protocol.md. */
export interface SequencePoint {
  forceKg: number
  /** ms since the sequence started emitting. */
  offsetMs: number
}

export interface Sequence {
  id: string
  /** How EmulatorDevice paces emission — see docs/02 "Behavior". */
  pacing: 'batched' | 'single'
  points: SequencePoint[]
}
