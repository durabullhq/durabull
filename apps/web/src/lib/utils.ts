import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs))
}

/**
 * Get the current timezone abbreviation (e.g., PST, PDT, EST, EDT)
 */
export function getTimezoneAbbreviation(): string {
  const date = new Date()
  // Get the timezone string like "Pacific Daylight Time" or "America/Los_Angeles"
  const timezoneName =
    Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value || ''

  return timezoneName
}

/**
 * Format a timestamp to local date/time string
 */
export function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

/**
 * Format a timestamp with the timezone abbreviation included
 */
export function formatDateWithTimezone(timestamp: number | undefined): string {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  })
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`
  return `${(ms / 3600000).toFixed(1)}h`
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num)
}

export function formatCompactNumber(num: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
    .format(num)
    .toLowerCase()
}
