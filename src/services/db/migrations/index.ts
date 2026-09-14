import type { Migration } from '../migrator'
import { migration0001Initial } from './0001_initial'

// Registry, in order. Append new migrations here — never edit or remove one
// that has shipped. See docs/06-non-functional-and-open-source.md.
export const migrations: Migration[] = [migration0001Initial]
