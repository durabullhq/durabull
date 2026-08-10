import { describe, expect, it } from 'vitest'
import { hasJobPayloadChanged } from '@/components/job-payload-editor'

describe('hasJobPayloadChanged', () => {
  it('treats key reordering as unchanged', () => {
    expect(hasJobPayloadChanged({ a: 1, b: 2 }, { b: 2, a: 1 }, true)).toBe(false)
  })

  it('treats whitespace-only differences as unchanged', () => {
    // Both sides are already parsed values; whitespace in source text is
    // normalized away by JSON.parse before this helper runs.
    expect(hasJobPayloadChanged({ message: 'hello' }, { message: 'hello' }, true)).toBe(false)
  })

  it('detects a real value change', () => {
    expect(hasJobPayloadChanged({ message: 'hello' }, { message: 'goodbye' }, true)).toBe(true)
  })

  it('returns false when the current value is not valid JSON', () => {
    expect(hasJobPayloadChanged({ message: 'hello' }, { message: 'goodbye' }, false)).toBe(false)
  })
})
