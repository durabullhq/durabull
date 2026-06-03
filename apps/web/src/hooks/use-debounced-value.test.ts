import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from '@/hooks/use-debounced-value'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('alpha'))
    expect(result.current).toBe('alpha')
  })

  it('updates after the delay when the value changes', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'alpha' },
    })

    rerender({ value: 'beta' })
    expect(result.current).toBe('alpha')

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('alpha')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('beta')
  })

  it('resets the timer when the value changes again before the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'alpha' },
    })

    rerender({ value: 'beta' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ value: 'gamma' })

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('alpha')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('gamma')
  })

  it('syncs immediately when resetKey changes', () => {
    const { result, rerender } = renderHook(
      ({ value, resetKey }) => useDebouncedValue(value, 300, { resetKey }),
      { initialProps: { value: 'alpha', resetKey: 'conn-1' } }
    )

    rerender({ value: 'beta', resetKey: 'conn-1' })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe('alpha')

    rerender({ value: '', resetKey: 'conn-2' })
    expect(result.current).toBe('')
  })
})
