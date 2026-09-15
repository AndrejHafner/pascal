// Shared Band type — see docs/03-training-and-data-model.md "Target-band
// training set". Lives in its own module so tut.ts and zone.ts can both
// depend on it without importing from each other.

export interface Band {
  targetKg: number
  toleranceKg: number
}
