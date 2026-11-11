import type { AlertEventRecord } from '@/hooks/use-alerts'

/** Coalesced-incident count recorded in event context by the suppression pipeline. */
export function getSuppressedCount(event: Pick<AlertEventRecord, 'context'>): number {
  const count = event.context.suppressedCount
  return typeof count === 'number' ? count : 0
}

/**
 * Installs without accounts (desktop, authless self-hosting) record every
 * action against one synthetic user. Naming it in the UI is noise.
 */
const SYNTHETIC_ACTOR_NAMES = new Set(['Authless User', 'Local user'])

/** " by Sam Operator" for a real person, "" when there is nobody meaningful to credit. */
export function formatActorSuffix(name: string | null | undefined): string {
  if (!name || SYNTHETIC_ACTOR_NAMES.has(name)) return ''
  return ` by ${name}`
}
