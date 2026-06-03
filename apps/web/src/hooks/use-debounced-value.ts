import { useEffect, useState } from 'react'

const DEFAULT_DELAY_MS = 300

/**
 * Returns a debounced copy of `value` that updates after `delayMs` without further changes.
 */
export function useDebouncedValue<T>(value: T, delayMs = DEFAULT_DELAY_MS): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debouncedValue
}
