import {
  QUEUE_SORT_FIELDS,
  type QueueSortField,
  type QueueSortOrder,
  type QueueStatusFilter,
} from '@/hooks/use-queues'

/**
 * User-saved default view for the queues list (sorting + filters).
 * Persisted to localStorage and applied whenever the dashboard is opened
 * without explicit search params in the URL.
 */
export interface QueuesDefaultView {
  q: string
  status: QueueStatusFilter | ''
  sortBy: QueueSortField
  sortOrder: QueueSortOrder
}

const STORAGE_KEY = 'durabull:queues-default-view:v1'

export const FALLBACK_QUEUES_VIEW: QueuesDefaultView = {
  q: '',
  status: '',
  sortBy: 'name',
  sortOrder: 'asc',
}

const STATUS_VALUES = new Set(['', 'active', 'paused'])
const SORT_FIELD_VALUES = new Set<string>(QUEUE_SORT_FIELDS)
const SORT_ORDER_VALUES = new Set(['asc', 'desc'])

// localStorage reads are synchronous and relatively expensive; cache in memory.
let cachedView: QueuesDefaultView | undefined

function parseView(raw: string): QueuesDefaultView | null {
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null) return null

  const view = parsed as Record<string, unknown>
  if (
    typeof view.q !== 'string' ||
    typeof view.status !== 'string' ||
    !STATUS_VALUES.has(view.status) ||
    typeof view.sortBy !== 'string' ||
    !SORT_FIELD_VALUES.has(view.sortBy) ||
    typeof view.sortOrder !== 'string' ||
    !SORT_ORDER_VALUES.has(view.sortOrder)
  ) {
    return null
  }

  return {
    q: view.q,
    status: view.status as QueuesDefaultView['status'],
    sortBy: view.sortBy as QueueSortField,
    sortOrder: view.sortOrder as QueueSortOrder,
  }
}

export function getDefaultQueuesView(): QueuesDefaultView {
  if (cachedView !== undefined) return cachedView

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    cachedView = (raw ? parseView(raw) : null) ?? FALLBACK_QUEUES_VIEW
  } catch {
    // Throws in private browsing or when storage is disabled
    cachedView = FALLBACK_QUEUES_VIEW
  }

  return cachedView
}

export function saveDefaultQueuesView(view: QueuesDefaultView): void {
  cachedView = view
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view))
  } catch {
    // Best effort: the in-memory cache still applies for this session
  }
}

export function isSameQueuesView(a: QueuesDefaultView, b: QueuesDefaultView): boolean {
  return (
    a.q === b.q && a.status === b.status && a.sortBy === b.sortBy && a.sortOrder === b.sortOrder
  )
}
