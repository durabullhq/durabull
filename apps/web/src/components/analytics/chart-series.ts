/** Every analytics plot shares one height so rows of panels line up. */
export const CHART_HEIGHT_CLASS = 'h-[220px] w-full'

/**
 * Colours for series that represent a job state. They use the status tokens, so a
 * failed series is the same red as a failed badge. Series that are categories
 * rather than states (queues, Redis metrics) use the `chart-1…5` tokens in order.
 */
export const SERIES_COLOR = {
  completed: 'var(--color-status-success)',
  active: 'var(--color-status-active)',
  delayed: 'var(--color-status-delayed)',
  priority: 'var(--color-status-priority)',
  failed: 'var(--color-status-danger)',
  waiting: 'var(--color-status-neutral)',
} as const
