/**
 * Marks a mutation that can change what the plan counts or pauses: creating,
 * deleting, enabling or disabling a connection, alert rule, destination or
 * service account, and changing members or invitations. After one succeeds the
 * plan state (gates, counts, paused badges) is refreshed; other mutations, such
 * as retrying jobs or pausing a queue, leave it alone.
 */
export const PLAN_USAGE_META = { affectsPlanUsage: true } as const

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { affectsPlanUsage?: boolean }
  }
}
