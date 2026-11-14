/**
 * Helpers for the queue flow-controls form: unit conversion, input parsing,
 * and diffing the form against the server state so only changed controls are sent.
 */

export const MAX_GLOBAL_CONCURRENCY = 100_000
export const MAX_RATE_LIMIT_JOBS = 1_000_000
export const MAX_RATE_LIMIT_DURATION_MS = 86_400_000

export const DURATION_UNITS = [
  { value: 'ms', label: 'milliseconds', ms: 1 },
  { value: 's', label: 'seconds', ms: 1_000 },
  { value: 'm', label: 'minutes', ms: 60_000 },
  { value: 'h', label: 'hours', ms: 3_600_000 },
] as const

export type DurationUnit = (typeof DURATION_UNITS)[number]['value']

export interface FlowControlLimits {
  globalConcurrency: number | null
  globalRateLimit: { max: number; durationMs: number } | null
}

export interface FlowControlsForm {
  concurrencyEnabled: boolean
  concurrency: string
  rateLimitEnabled: boolean
  rateLimitMax: string
  rateLimitDuration: string
  rateLimitUnit: DurationUnit
}

function unitMs(unit: DurationUnit): number {
  return DURATION_UNITS.find((entry) => entry.value === unit)?.ms ?? 1
}

/** Picks the largest unit that represents `ms` as a whole number. */
export function splitDuration(ms: number): { amount: number; unit: DurationUnit } {
  for (const entry of [...DURATION_UNITS].reverse()) {
    if (ms >= entry.ms && ms % entry.ms === 0) {
      return { amount: ms / entry.ms, unit: entry.value }
    }
  }
  return { amount: ms, unit: 'ms' }
}

export function formatDurationMs(ms: number): string {
  const { amount, unit } = splitDuration(ms)
  const label = DURATION_UNITS.find((entry) => entry.value === unit)?.label ?? 'milliseconds'
  if (amount === 1) {
    // "1 second", "1 minute"
    return `1 ${label.slice(0, -1)}`
  }
  return `${amount.toLocaleString()} ${label}`
}

export function formatRateLimit(rateLimit: { max: number; durationMs: number }): string {
  const { amount, unit } = splitDuration(rateLimit.durationMs)
  const per =
    amount === 1
      ? (DURATION_UNITS.find((entry) => entry.value === unit)?.label.slice(0, -1) ?? 'ms')
      : formatDurationMs(rateLimit.durationMs)
  return `${rateLimit.max.toLocaleString()} jobs / ${per}`
}

export function formFromLimits(limits: FlowControlLimits | null | undefined): FlowControlsForm {
  const rateLimit = limits?.globalRateLimit ?? null
  const duration = rateLimit
    ? splitDuration(rateLimit.durationMs)
    : { amount: 1, unit: 's' as const }
  return {
    concurrencyEnabled: limits?.globalConcurrency != null,
    concurrency: limits?.globalConcurrency != null ? String(limits.globalConcurrency) : '',
    rateLimitEnabled: rateLimit !== null,
    rateLimitMax: rateLimit ? String(rateLimit.max) : '',
    rateLimitDuration: String(duration.amount),
    rateLimitUnit: duration.unit,
  }
}

function parsePositiveInt(raw: string, max: number): number | null {
  const value = raw.trim()
  if (!/^\d+$/.test(value)) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) return null
  return parsed
}

export interface FlowControlsValidation {
  concurrencyError: string | null
  rateLimitMaxError: string | null
  rateLimitDurationError: string | null
  /** Parsed target limits, or null when the form is invalid. */
  limits: FlowControlLimits | null
}

export function validateFlowControlsForm(form: FlowControlsForm): FlowControlsValidation {
  let concurrencyError: string | null = null
  let rateLimitMaxError: string | null = null
  let rateLimitDurationError: string | null = null
  let globalConcurrency: number | null = null
  let globalRateLimit: FlowControlLimits['globalRateLimit'] = null

  if (form.concurrencyEnabled) {
    globalConcurrency = parsePositiveInt(form.concurrency, MAX_GLOBAL_CONCURRENCY)
    if (globalConcurrency === null) {
      concurrencyError = `Enter a whole number from 1 to ${MAX_GLOBAL_CONCURRENCY.toLocaleString()}.`
    }
  }

  if (form.rateLimitEnabled) {
    const max = parsePositiveInt(form.rateLimitMax, MAX_RATE_LIMIT_JOBS)
    if (max === null) {
      rateLimitMaxError = `Enter a whole number from 1 to ${MAX_RATE_LIMIT_JOBS.toLocaleString()}.`
    }
    const amount = parsePositiveInt(form.rateLimitDuration, MAX_RATE_LIMIT_DURATION_MS)
    const durationMs = amount === null ? null : amount * unitMs(form.rateLimitUnit)
    if (durationMs === null || durationMs > MAX_RATE_LIMIT_DURATION_MS) {
      rateLimitDurationError = 'Enter a window from 1 millisecond to 24 hours.'
    }
    if (max !== null && durationMs !== null && durationMs <= MAX_RATE_LIMIT_DURATION_MS) {
      globalRateLimit = { max, durationMs }
    }
  }

  const valid = !concurrencyError && !rateLimitMaxError && !rateLimitDurationError
  return {
    concurrencyError,
    rateLimitMaxError,
    rateLimitDurationError,
    limits: valid ? { globalConcurrency, globalRateLimit } : null,
  }
}

/**
 * Returns only the controls that differ from `current`, in the API's update shape.
 * An empty object means there is nothing to save.
 */
export function diffFlowControls(
  current: FlowControlLimits,
  next: FlowControlLimits
): {
  globalConcurrency?: number | null
  globalRateLimit?: { max: number; durationMs: number } | null
} {
  const update: ReturnType<typeof diffFlowControls> = {}
  if (current.globalConcurrency !== next.globalConcurrency) {
    update.globalConcurrency = next.globalConcurrency
  }
  const a = current.globalRateLimit
  const b = next.globalRateLimit
  if (
    (a === null) !== (b === null) ||
    (a && b && (a.max !== b.max || a.durationMs !== b.durationMs))
  ) {
    update.globalRateLimit = b
  }
  return update
}

const SHORT_UNIT: Record<DurationUnit, string> = { ms: 'ms', s: 's', m: 'min', h: 'h' }

/** Compact header summary such as `5 concurrent · 100/s`, or null when nothing is set. */
export function formatFlowControlsSummary(
  limits: FlowControlLimits | null | undefined
): string | null {
  if (!limits) return null
  const parts: string[] = []
  if (limits.globalConcurrency !== null) {
    parts.push(`${limits.globalConcurrency.toLocaleString()} concurrent`)
  }
  if (limits.globalRateLimit) {
    const { amount, unit } = splitDuration(limits.globalRateLimit.durationMs)
    const window = amount === 1 ? SHORT_UNIT[unit] : `${amount.toLocaleString()}${SHORT_UNIT[unit]}`
    parts.push(`${limits.globalRateLimit.max.toLocaleString()}/${window}`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}
