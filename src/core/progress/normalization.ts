// kg <-> %bodyweight normalization — see docs/04-screens-and-ux.md
// "Progress": "Toggle absolute kg <-> % bodyweight (normalization computed
// from stored bodyweight at test time, per docs/03)." Each MaxRecord
// stores its own bodyweightKgAtTest, so normalization is always relative
// to what the climber weighed on the day of THAT test, not today's weight
// — otherwise a bodyweight change would silently reshape historical points.

export function toPercentBodyweight(forceKg: number, bodyweightKgAtTest: number): number {
  if (bodyweightKgAtTest <= 0) return 0
  return (forceKg / bodyweightKgAtTest) * 100
}
