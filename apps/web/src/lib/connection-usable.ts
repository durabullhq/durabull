/** Enabled and not paused by the plan: its queues, workers and alerts are reachable. */
export function isUsableConnection(connection: {
  enabled?: boolean | null
  suspended?: boolean | null
}): boolean {
  return connection.enabled !== false && connection.suspended !== true
}
