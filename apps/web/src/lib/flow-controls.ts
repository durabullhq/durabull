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

/** API update shape: an omitted control stays unchanged, `null` removes it. */
export type FlowControlsUpdate = Partial<FlowControlLimits>

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

/**
 * Parses and range-checks the form. `baseline` is the server state the form was
 * seeded from: a control still showing its baseline value passes as-is even when it
 * is outside the editor's ranges (for example a 48 hour window set from worker
 * code), so it is not sent and does not block saving the other control.
 */
export function validateFlowControlsForm(
  form: FlowControlsForm,
  baseline?: FlowControlLimits | null
): FlowControlsValidation {
  let concurrencyError: string | null = null
  let rateLimitMaxError: string | null = null
  let rateLimitDurationError: string | null = null
  let globalConcurrency: number | null = null
  let globalRateLimit: FlowControlLimits['globalRateLimit'] = null
  const seeded = baseline ? formFromLimits(baseline) : null
  const baselineConcurrency =
    seeded?.concurrencyEnabled && form.concurrency.trim() === seeded.concurrency
      ? (baseline?.globalConcurrency ?? null)
      : null
  const baselineRateLimit =
    seeded?.rateLimitEnabled &&
    form.rateLimitMax.trim() === seeded.rateLimitMax &&
    form.rateLimitDuration.trim() === seeded.rateLimitDuration &&
    form.rateLimitUnit === seeded.rateLimitUnit
      ? (baseline?.globalRateLimit ?? null)
      : null

  if (form.concurrencyEnabled && baselineConcurrency !== null) {
    globalConcurrency = baselineConcurrency
  } else if (form.concurrencyEnabled) {
    globalConcurrency = parsePositiveInt(form.concurrency, MAX_GLOBAL_CONCURRENCY)
    if (globalConcurrency === null) {
      concurrencyError = `Enter a whole number from 1 to ${MAX_GLOBAL_CONCURRENCY.toLocaleString()}.`
    }
  }

  if (form.rateLimitEnabled && baselineRateLimit !== null) {
    globalRateLimit = baselineRateLimit
  } else if (form.rateLimitEnabled) {
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
): FlowControlsUpdate {
  const update: FlowControlsUpdate = {}
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

/** Countdown text for the throttle window, e.g. `4.2 s`, `42 s`, `1 min 5 s`. */
export function formatTtl(ms: number): string {
  if (ms < 1_000) return `${ms} ms`
  if (ms < 9_950) return `${(ms / 1_000).toFixed(1)} s`
  // Round once up front so the parts never read "60 s" or "1 min 60 s".
  const totalSeconds = Math.round(ms / 1_000)
  if (totalSeconds < 60) return `${totalSeconds} s`
  return `${Math.floor(totalSeconds / 60)} min ${totalSeconds % 60} s`
}
