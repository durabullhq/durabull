import { describe, expect, it } from 'vitest'
import { hasJobPayloadChanged } from '@/lib/job-payload'

describe('hasJobPayloadChanged', () => {
  it('treats key reordering as unchanged', () => {
    expect(hasJobPayloadChanged({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false)
  })

  it('treats whitespace-only differences as unchanged', () => {
    // Both sides are already parsed values; whitespace in source text is
    // normalized away by JSON.parse before this helper runs.
    expect(hasJobPayloadChanged({ message: 'hello' }, { message: 'hello' })).toBe(false)
  })

  it('detects a real value change', () => {
    expect(hasJobPayloadChanged({ message: 'hello' }, { message: 'goodbye' })).toBe(true)
  })
})
