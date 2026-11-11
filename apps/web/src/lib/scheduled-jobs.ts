import cronstrue from 'cronstrue'

const SCHEDULER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.-]*$/

export interface ScheduledJobLike {
  pattern?: string
  every?: number
  timezone?: string
  startDate?: number
  endDate?: number
}

export function isValidSchedulerId(value: string): boolean {
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= 128 && SCHEDULER_ID_PATTERN.test(normalized)
}

export function slugifySchedulerId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

  return normalized || 'scheduled-job'
}

export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone === 'UTC') {
    return true
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

/**
 * Label for a cron schedule with no stored timezone. BullMQ then evaluates the
 * pattern in the timezone of the process that schedules the next run — the
 * worker host — which is usually, but not necessarily, UTC. Never display or
 * submit a concrete timezone in its place.
 */
export const HOST_TIME_ZONE_LABEL = 'worker host time'

/** The stored timezone, or the honest label when none is stored. */
export function formatScheduleTimeZone(timeZone: string | null | undefined): string {
  return timeZone?.trim() || HOST_TIME_ZONE_LABEL
}

export function getTimeZoneOptions(): string[] {
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const supportedValues = Intl.supportedValuesOf?.('timeZone') ?? []
  const options = new Set<string>(['UTC', browserTimeZone, ...supportedValues])
  return Array.from(options).sort((a, b) => a.localeCompare(b))
}

export function formatInterval(ms: number): string {
  const units = [
    { label: 'day', value: 24 * 60 * 60 * 1000 },
    { label: 'hour', value: 60 * 60 * 1000 },
    { label: 'minute', value: 60 * 1000 },
    { label: 'second', value: 1000 },
  ]

  for (const unit of units) {
    if (ms >= unit.value && ms % unit.value === 0) {
      const count = ms / unit.value
      return `${count} ${unit.label}${count === 1 ? '' : 's'}`
    }
  }

  return `${ms.toLocaleString()} ms`
}

export function getCronDescription(pattern: string): string {
  try {
    return cronstrue.toString(pattern)
  } catch {
    return 'Invalid cron pattern'
  }
}

export function getScheduleSummary(job: ScheduledJobLike): string {
  if (job.pattern) {
    return getCronDescription(job.pattern)
  }

  if (typeof job.every === 'number') {
    return `Every ${formatInterval(job.every)}`
  }

  return 'Unknown schedule'
}

export function getScheduleExpression(job: ScheduledJobLike): string {
  if (job.pattern) {
    return job.pattern
  }

  if (typeof job.every === 'number') {
    return `every ${formatInterval(job.every)}`
  }

  return '—'
}

export function toDateTimeLocalValue(timestamp?: number): string {
  if (!timestamp) {
    return ''
  }

  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function fromDateTimeLocalValue(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}
