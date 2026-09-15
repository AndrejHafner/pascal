import { isNewPersonalBest } from '../../../src/core/progress/personalBest'

describe('isNewPersonalBest', () => {
  it('the very first record for an exercise/hand is always a PB', () => {
    expect(isNewPersonalBest(30, null)).toBe(true)
  })

  it('is a PB when the candidate strictly exceeds the prior best', () => {
    expect(isNewPersonalBest(35, 30)).toBe(true)
  })

  it('is not a PB when the candidate equals the prior best', () => {
    expect(isNewPersonalBest(30, 30)).toBe(false)
  })

  it('is not a PB when the candidate is below the prior best', () => {
    expect(isNewPersonalBest(28, 30)).toBe(false)
  })
})
