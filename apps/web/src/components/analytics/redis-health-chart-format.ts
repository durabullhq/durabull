const MULTI_DAY_RANGE_MS = 24 * 60 * 60 * 1000

export function formatRedisHealthChartTick(value: number, rangeDurationMs: number) {
  if (rangeDurationMs >= MULTI_DAY_RANGE_MS) {
    return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
