export type Data = Record<string, unknown>

/** Normalize untrusted structured values before reading object fields. */
export const obj = (value: unknown): Data =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Data) : {}
/** Normalize an optional collection into records for list rendering. */
export const rows = (value: unknown): Data[] => (Array.isArray(value) ? value.map(obj) : [])
/** Accept only strings from host data; other values become an empty label. */
export const str = (value: unknown) => (typeof value === 'string' ? value : '')
/** Exclude nonfinite and nonnumeric values from calculations. */
export const num = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0
/** Narrow optional string collections such as queue names or log lines. */
export const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const integer = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const compact = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
})
/** Format counts using the host locale and preserve missing values. */
export const fmt = (value: unknown) => (value == null ? '—' : integer.format(num(value)))
/** Shorten large counts for stat tiles; exact values stay available in titles. */
export const short = (value: unknown) =>
  value == null
    ? '—'
    : num(value) < 10_000
      ? integer.format(num(value))
      : compact.format(num(value))
/** Percentages arrive as 0–100 values from the server. */
export const percent = (value: unknown) => (value == null ? '—' : `${integer.format(num(value))}%`)
/** Convert protocol identifiers into sentence-case labels. */
export const title = (value: string) =>
  value
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (s) => s.toUpperCase())

/** Readable binary sizes for Redis memory figures. */
export function bytes(value: unknown) {
  if (value == null) return '—'
  let size = num(value)
  for (const unit of ['B', 'KB', 'MB', 'GB', 'TB']) {
    if (Math.abs(size) < 1024 || unit === 'TB') return `${integer.format(size)} ${unit}`
    size /= 1024
  }
  return '—'
}

/** Humanize millisecond durations such as worker age or idle time. */
export function duration(value: unknown) {
  if (value == null) return '—'
  const ms = Math.max(0, num(value))
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${integer.format(seconds)}s`
  const minutes = seconds / 60
  if (minutes < 60) return `${Math.round(minutes)}m`
  const hours = minutes / 60
  if (hours < 48) return `${integer.format(hours)}h`
  return `${integer.format(hours / 24)}d`
}

/** Accept ISO strings or epoch milliseconds; reject anything else. */
export function toDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
/** Absolute timestamp in the viewer's locale and timezone. */
export function when(value: unknown) {
  const date = toDate(value)
  return date ? dateTime.format(date) : '—'
}
/** Short clock time for "Updated" footers. */
export const time = (date: Date) => clock.format(date)

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' })
/** Relative phrasing such as "5 min. ago" or "in 2 hr." */
export function ago(value: unknown, now = Date.now()) {
  const date = toDate(value)
  if (!date) return '—'
  const seconds = Math.round((date.getTime() - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return seconds < 0 ? 'just now' : 'in a moment'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour')
  return relative.format(Math.round(seconds / 86_400), 'day')
}

/** Serialize redacted payloads for disclosure panels. */
export const json = (value: unknown) =>
  value == null ? 'null' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)
/** Ratios arrive as 0–1 values (success/failure rates, window coverage). */
export const ratio = (value: unknown) =>
  value == null ? '—' : `${integer.format(Math.round(num(value) * 1000) / 10)}%`
/** Serialize values for text-only cells. */
export const text = (value: unknown) =>
  value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)
/** Join the present parts of a metadata line with middle dots. */
export const dotted = (...parts: unknown[]) =>
  parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' · ')
/** Locale-formatted count with a singular or plural noun, e.g. "1 worker", "3 workers". */
export const count = (value: unknown, singular: string, plural = `${singular}s`) =>
  `${fmt(value)} ${num(value) === 1 ? singular : plural}`
