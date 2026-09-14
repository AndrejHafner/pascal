import type { SequencePoint } from './types'

/**
 * Deterministic pseudo-random noise generator (mulberry32) — used so
 * "noisy" sequences are reproducible across test runs rather than flaky.
 */
export function makeRng(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Generates evenly-spaced points at `intervalMs`, value from `fn(tMs)`. */
export function generatePoints(
  durationMs: number,
  intervalMs: number,
  fn: (offsetMs: number) => number,
): SequencePoint[] {
  const points: SequencePoint[] = []
  for (let t = 0; t <= durationMs; t += intervalMs) {
    points.push({ offsetMs: t, forceKg: Math.max(0, fn(t)) })
  }
  return points
}
