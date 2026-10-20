/** Pricing snapshot: https://trigger.dev/pricing, reviewed 2026-10-20. */
export const TRIGGER_SMALL_1X = { perSecond: 0.0000338, perRun: 0.000025 } as const
export function triggerUsage(runs: number, seconds: number) {
  const invocation = runs * TRIGGER_SMALL_1X.perRun
  const compute = runs * seconds * TRIGGER_SMALL_1X.perSecond
  return { invocation, compute, total: invocation + compute }
}
export function inngestExecutions(runs: number, steps: number) {
  return runs * (steps + 1)
}
