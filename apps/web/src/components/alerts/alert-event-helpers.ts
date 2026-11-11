import type { AlertEventRecord } from '@/hooks/use-alerts'

/** Coalesced-incident count recorded in event context by the suppression pipeline. */
export function getSuppressedCount(event: Pick<AlertEventRecord, 'context'>): number {
  const count = event.context.suppressedCount
  return typeof count === 'number' ? count : 0
}

/**
 * " by Sam Operator" when the acknowledger is known, "" otherwise. In installs
 * without accounts the API omits the name (see `withVisibleActor` in the API),
 * so there is nothing to filter here.
 */
export function formatActorSuffix(name: string | null | undefined): string {
  const trimmed = name?.trim()
  return trimmed ? ` by ${trimmed}` : ''
}
