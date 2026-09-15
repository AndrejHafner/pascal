/** ms -> "7.2s" style short duration string for the live session readouts. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

/** ms -> "3:00" style mm:ss for longer rest countdowns. */
export function formatMinutesSeconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
