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
  /**
   * Whether EmulatorDevice restarts from the first point after the last one
   * plays, instead of going silent. Most sequences are short clips standing
   * in for a continuous live device — a work phase or a second hand can
   * easily outlast one clip's length, so they loop by default. `dropout` is
   * the deliberate exception: going silent *is* the behavior under test, so
   * it must not loop. Defaults to true when omitted.
   */
  loop?: boolean
}
