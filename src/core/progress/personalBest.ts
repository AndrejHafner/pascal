// Personal-best detection — see docs/04-screens-and-ux.md "Session
// summary": "Per-exercise max achieved this session, and whether it's a
// new PB (celebrated, but quietly — this is a personal tool, not a game)."

/**
 * True when `candidateForceKg` beats every prior recorded max for this
 * exercise + hand. `priorBestForceKg` is null when no earlier record
 * exists — the very first max for an exercise/hand is always a PB (there's
 * nothing to lose to).
 */
export function isNewPersonalBest(
  candidateForceKg: number,
  priorBestForceKg: number | null,
): boolean {
  if (priorBestForceKg === null) return true
  return candidateForceKg > priorBestForceKg
}
