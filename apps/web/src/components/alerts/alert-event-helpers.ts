import type { AlertEventRecord } from '@/hooks/use-alerts'

/** Coalesced-incident count recorded in event context by the suppression pipeline. */
export function getSuppressedCount(event: Pick<AlertEventRecord, 'context'>): number {
  const count = event.context.suppressedCount
  return typeof count === 'number' ? count : 0
}
