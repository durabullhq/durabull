const REDIS_HEALTH_METRIC_META = {
  memory_usage_percent: { chart: 'utilization', unit: 'percent' },
  used_memory_megabytes: { chart: 'memory', unit: 'mebibytes' },
  resident_memory_megabytes: { chart: 'memory', unit: 'mebibytes' },
  cpu_usage_percent: { chart: 'utilization', unit: 'percent' },
  memory_fragmentation_ratio: { chart: 'memoryPressure', unit: 'ratio' },
  connected_clients_percent: { chart: 'utilization', unit: 'percent' },
  blocked_clients: { chart: 'clientPressure', unit: 'count' },
  evicted_keys_per_minute: { chart: 'memoryPressure', unit: 'rate' },
  rejected_connections_per_minute: { chart: 'clientPressure', unit: 'rate' },
} as const

export type RedisHealthMetric = keyof typeof REDIS_HEALTH_METRIC_META
export type RedisHealthChartGroup = (typeof REDIS_HEALTH_METRIC_META)[RedisHealthMetric]['chart']

export interface RedisHealthThreshold {
  ruleId: string
  name: string
  metric: RedisHealthMetric
  threshold: number
}

export function thresholdsForChart(
  thresholds: RedisHealthThreshold[],
  chart: RedisHealthChartGroup
) {
  return thresholds.filter(
    (threshold) => REDIS_HEALTH_METRIC_META[threshold.metric].chart === chart
  )
}

export function formatRedisHealthThreshold(metric: RedisHealthMetric, threshold: number) {
  switch (REDIS_HEALTH_METRIC_META[metric].unit) {
    case 'percent':
      return `${threshold}%`
    case 'mebibytes':
      return `${threshold} MiB`
    case 'ratio':
      return `${threshold}×`
    case 'rate':
      return `${threshold}/min`
    default:
      return String(threshold)
  }
}
