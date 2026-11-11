import type { AlertEventFilterOptions } from '@/hooks/use-alerts'

export type IncidentStatusFilter =
  | 'open'
  | 'firing'
  | 'acknowledged'
  | 'resolved'
  | 'suppressed'
  | 'all'

export const STATUS_FILTER_OPTIONS: Array<{
  value: IncidentStatusFilter
  label: string
  /** Compact label for the one-click filter row. */
  shortLabel: string
}> = [
  { value: 'open', label: 'Open', shortLabel: 'Open' },
  { value: 'firing', label: 'Firing (unacknowledged)', shortLabel: 'Unacknowledged' },
  { value: 'acknowledged', label: 'Acknowledged', shortLabel: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved', shortLabel: 'Resolved' },
  { value: 'suppressed', label: 'Suppressed', shortLabel: 'Suppressed' },
  { value: 'all', label: 'All statuses', shortLabel: 'All' },
]

/** Map the UI status filter to alert event query filters. "Open" means firing incl. acknowledged. */
export function eventFiltersForStatus(status: IncidentStatusFilter): AlertEventFilterOptions {
  switch (status) {
    case 'open':
      return { status: 'firing' }
    case 'firing':
      return { status: 'firing', acknowledged: false }
    case 'acknowledged':
      return { status: 'firing', acknowledged: true }
    case 'resolved':
      return { status: 'resolved' }
    case 'suppressed':
      return { status: 'suppressed' }
    case 'all':
      return {}
  }
}
