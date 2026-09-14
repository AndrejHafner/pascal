import type { Sequence } from './types'
import { steadyPull } from './steadyPull'
import { repeaters } from './repeaters'
import { noisyPull } from './noisyPull'
import { dropout } from './dropout'
import { slowWhc06 } from './slowWhc06'

export type { Sequence, SequencePoint } from './types'

/** The five named sequences required by docs/02-ble-protocol.md. */
export const sequences: Record<string, Sequence> = {
  [steadyPull.id]: steadyPull,
  [repeaters.id]: repeaters,
  [noisyPull.id]: noisyPull,
  [dropout.id]: dropout,
  [slowWhc06.id]: slowWhc06,
}

export function getSequence(id: string): Sequence {
  const sequence = sequences[id]
  if (!sequence) {
    throw new Error(
      `Unknown emulator sequence: "${id}". Known: ${Object.keys(sequences).join(', ')}`,
    )
  }
  return sequence
}
