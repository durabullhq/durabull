import { useEffect, useRef, useState } from 'react'

const DEFAULT_DELAY_MS = 300

export type UseDebouncedValueOptions = {
  /** When this key changes, `debouncedValue` syncs to `value` immediately (no debounce wait). */
  resetKey?: unknown
}

/**
 * Returns a debounced copy of `value` that updates after `delayMs` without further changes.
 */
export function useDebouncedValue<T>(
  value: T,
  delayMs = DEFAULT_DELAY_MS,
  options?: UseDebouncedValueOptions
): T {
  const resetKey = options?.resetKey
  const [debouncedValue, setDebouncedValue] = useState(value)
  const prevResetKeyRef = useRef(resetKey)

  useEffect(() => {
    if (resetKey === undefined) return
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey
      setDebouncedValue(value)
    }
  }, [resetKey, value])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debouncedValue
}
