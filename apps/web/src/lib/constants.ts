/**
 * Application-wide constants
 * Centralizes magic strings and configuration values
 */

/**
 * Job status values used throughout the application
 * These correspond to BullMQ job states
 */
export const JOB_STATUS = {
  WAITING: 'waiting',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DELAYED: 'delayed',
  PAUSED: 'paused',
  PRIORITIZED: 'prioritized',
  'WAITING-CHILDREN': 'waiting-children',
} as const

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS]

export const JOB_SORT_FIELDS = ['id', 'name', 'status', 'attempts', 'created', 'finished'] as const
export type JobSortField = (typeof JOB_SORT_FIELDS)[number]

/**
 * Job status options for select dropdowns and filters
 */
export const JOB_STATUS_OPTIONS = [
  { value: JOB_STATUS.WAITING, label: 'Waiting' },
  { value: JOB_STATUS.ACTIVE, label: 'Active' },
  { value: JOB_STATUS.COMPLETED, label: 'Completed' },
  { value: JOB_STATUS.FAILED, label: 'Failed' },
  { value: JOB_STATUS.DELAYED, label: 'Delayed' },
  { value: JOB_STATUS.PAUSED, label: 'Paused' },
  { value: JOB_STATUS.PRIORITIZED, label: 'Prioritized' },
  { value: JOB_STATUS['WAITING-CHILDREN'], label: 'Waiting for Children' },
] as const

/**
 * Queue status values
 */
export const QUEUE_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
} as const

export type QueueStatus = (typeof QUEUE_STATUS)[keyof typeof QUEUE_STATUS]

/**
 * Default pagination configuration
 */
export const PAGINATION = {
  /** Default page size for job lists */
  DEFAULT_PAGE_SIZE: 20,
  /** Page size for the queues list */
  QUEUES_PAGE_SIZE: 50,
  /** Page size for log entries */
  LOGS_PAGE_SIZE: 50,
  /** Page size for stacktraces (smaller due to large content) */
  STACKTRACES_PAGE_SIZE: 20,
  /** Page size for Redis key search */
  REDIS_KEYS_PAGE_SIZE: 50,
} as const

/**
 * React Query stale time configuration (in milliseconds)
 */
export const STALE_TIME = {
  /** Default stale time for most queries */
  DEFAULT: 0,
  /** Stale time for relatively static data */
  STATIC: 30_000,
  /** Stale time for Redis keys (can change frequently) */
  REDIS_KEYS: 10_000,
  /** Short stale time for frequently changing data */
  FREQUENT: 5_000,
} as const

/**
 * Debounce delays (in milliseconds)
 */
export const DEBOUNCE = {
  /** Debounce for search inputs */
  SEARCH: 300,
  /** Debounce for slug validation */
  SLUG_CHECK: 500,
} as const
