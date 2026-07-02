import { describe, expect, it } from 'vitest'
import { formatCompactNumber } from '@/lib/utils'

describe('formatCompactNumber', () => {
  it('formats queue nav counts with compact lowercase suffixes', () => {
    expect(formatCompactNumber(5)).toBe('5')
    expect(formatCompactNumber(30)).toBe('30')
    expect(formatCompactNumber(350)).toBe('350')
    expect(formatCompactNumber(1500)).toBe('1.5k')
    expect(formatCompactNumber(10000)).toBe('10k')
  })
})
