import type { Metrics, Queue, QueueMeta } from 'bullmq'

export const DEFAULT_METRICS_WINDOW_MINUTES = 360
export const MAX_METRICS_WINDOW_MINUTES = 80640
/** Bounded window for MCP `get_queue_metrics` (24 hours). */
export const MCP_MAX_METRICS_WINDOW_MINUTES = 1440
export const DEFAULT_PRIORITY_BUCKETS = [1, 2, 5, 10, 20, 50] as const

interface CollectNativeMetricsOptions {
  queueName: string
  start: number
  end: number
  priorities: number[]
  includePrometheus: boolean
  requestedWindowMinutes: number | null
}

interface WorkerSnapshot {
  id: string
  name: string
  address: string
  ageMs: number
  idleMs: number
  raw: Record<string, string>
}

interface QueueEventClientSnapshot {
  id: string
  name: string
  address: string
  ageMs: number
  idleMs: number
  raw: Record<string, string>
}

interface SeriesPoint {
  metricIndex: number
  minuteOffset: number
  timestamp: number
  completed: number
  failed: number
  total: number
  successRate: number
  failureRate: number
}

function normalizeClientSnapshot(client: Record<string, string>) {
  return {
    id: client.id ?? '',
    name: client.name ?? '',
    address: client.addr ?? '',
    ageMs: Number(client.age ?? 0) || 0,
    idleMs: Number(client.idle ?? 0) || 0,
    raw: client,
  }
}

function normalizeBullTimestamp(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null
  }

  // Guard against Redis environments returning second-resolution timestamps.
  return value < 1_000_000_000_000 ? value * 1000 : value
}

function resolveSeriesAnchorTimestamp(completed: Metrics, failed: Metrics) {
  const completedPrevTs = normalizeBullTimestamp(completed.meta.prevTS)
  const failedPrevTs = normalizeBullTimestamp(failed.meta.prevTS)

  if (completedPrevTs !== null && failedPrevTs !== null) {
    return Math.max(completedPrevTs, failedPrevTs)
  }

  return completedPrevTs ?? failedPrevTs ?? Date.now()
}

function longestStreak(points: SeriesPoint[], predicate: (point: SeriesPoint) => boolean) {
  let longest = 0
  let current = 0

  for (const point of points) {
    if (predicate(point)) {
      current += 1
      if (current > longest) {
        longest = current
      }
      continue
    }
    current = 0
  }

  return longest
}

function buildSeriesPoints(completed: Metrics, failed: Metrics, start: number): SeriesPoint[] {
  const pointCount = Math.max(completed.data.length, failed.data.length)
  const anchorMinute = Math.floor(resolveSeriesAnchorTimestamp(completed, failed) / 60000) * 60000

  const newestFirst = Array.from({ length: pointCount }, (_, index) => {
    const completedCount = completed.data[index] ?? 0
    const failedCount = failed.data[index] ?? 0
    const total = completedCount + failedCount
    const minuteOffset = start + index

    return {
      metricIndex: index,
      minuteOffset,
      timestamp: anchorMinute - minuteOffset * 60000,
      completed: completedCount,
      failed: failedCount,
      total,
      successRate: total > 0 ? completedCount / total : 1,
      failureRate: total > 0 ? failedCount / total : 0,
    }
  })

  return newestFirst.reverse()
}

function parseCounts(jobCounts: { [index: string]: number }) {
  return {
    waiting: jobCounts.waiting ?? 0,
    active: jobCounts.active ?? 0,
    delayed: jobCounts.delayed ?? 0,
    completed: jobCounts.completed ?? 0,
    failed: jobCounts.failed ?? 0,
    paused: jobCounts.paused ?? 0,
    prioritized: jobCounts.prioritized ?? 0,
    waitingChildren: jobCounts['waiting-children'] ?? 0,
  }
}

function withMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

async function safeCall<T>(
  fn: () => Promise<T>,
  fallback: T,
  warning: string,
  warnings: string[]
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    warnings.push(`${warning}: ${withMessage(error, 'unavailable')}`)
    return fallback
  }
}

function parseMeta(meta: QueueMeta) {
  return {
    concurrency: meta.concurrency ?? null,
    max: meta.max ?? null,
    duration: meta.duration ?? null,
    maxLenEvents: meta.maxLenEvents ?? null,
    paused: meta.paused ?? null,
    version: meta.version ?? null,
  }
}

function parseGlobalRateLimit(rateLimit: { max: number; duration: number } | null) {
  if (!rateLimit) {
    return null
  }

  return {
    max: rateLimit.max,
    durationMs: rateLimit.duration,
  }
}

export async function collectQueueNativeMetrics(
  queue: Queue,
  {
    queueName,
    start,
    end,
    priorities,
    includePrometheus,
    requestedWindowMinutes,
  }: CollectNativeMetricsOptions
) {
  const warnings: string[] = []

  const [completedMetrics, failedMetrics, jobCountsRaw, waitingToProcess, isPaused, queueMeta] =
    await Promise.all([
      queue.getMetrics('completed', start, end),
      queue.getMetrics('failed', start, end),
      queue.getJobCounts(),
      queue.count(),
      queue.isPaused(),
      queue.getMeta(),
    ])

  const [
    isMaxed,
    workers,
    workersCount,
    schedulersCount,
    rateLimitTtlMs,
    globalConcurrency,
    globalRateLimit,
    priorityCounts,
    queueEvents,
    prometheusMetrics,
  ] = await Promise.all([
    safeCall(() => queue.isMaxed(), false, 'isMaxed unavailable', warnings),
    safeCall(
      () => queue.getWorkers(),
      [] as Array<Record<string, string>>,
      'workers unavailable',
      warnings
    ),
    safeCall(() => queue.getWorkersCount(), 0, 'workers count unavailable', warnings),
    safeCall(() => queue.getJobSchedulersCount(), 0, 'job scheduler count unavailable', warnings),
    safeCall(() => queue.getRateLimitTtl(), -2, 'rate limit TTL unavailable', warnings),
    safeCall(
      () => queue.getGlobalConcurrency(),
      null as number | null,
      'global concurrency unavailable',
      warnings
    ),
    safeCall(
      () => queue.getGlobalRateLimit(),
      null as { max: number; duration: number } | null,
      'global rate limit unavailable',
      warnings
    ),
    safeCall(
      () => queue.getCountsPerPriority(priorities),
      {} as { [index: string]: number },
      'priority counts unavailable',
      warnings
    ),
    safeCall(
      () => queue.getQueueEvents(),
      [] as Array<Record<string, string>>,
      'queue events unavailable',
      warnings
    ),
    includePrometheus
      ? safeCall(
          () => queue.exportPrometheusMetrics(),
          null as string | null,
          'Prometheus export unavailable',
          warnings
        )
      : Promise.resolve(null),
  ])

  const series = buildSeriesPoints(completedMetrics, failedMetrics, start)

  const completedInWindow = series.reduce((sum, point) => sum + point.completed, 0)
  const failedInWindow = series.reduce((sum, point) => sum + point.failed, 0)
  const finishedInWindow = completedInWindow + failedInWindow
  const minutesInWindow = series.length
  const minutesWithCompletionsInWindow = series.reduce(
    (sum, point) => sum + (point.completed > 0 ? 1 : 0),
    0
  )
  const minutesWithFailuresInWindow = series.reduce(
    (sum, point) => sum + (point.failed > 0 ? 1 : 0),
    0
  )
  const minutesWithFinishedJobsInWindow = series.reduce(
    (sum, point) => sum + (point.total > 0 ? 1 : 0),
    0
  )
  const avgCompletedPerMinuteInWindow =
    minutesInWindow > 0 ? completedInWindow / minutesInWindow : 0
  const avgFailedPerMinuteInWindow = minutesInWindow > 0 ? failedInWindow / minutesInWindow : 0
  const avgFinishedPerMinuteInWindow = minutesInWindow > 0 ? finishedInWindow / minutesInWindow : 0
  const peakCompletedPerMinuteInWindow = series.reduce(
    (max, point) => Math.max(max, point.completed),
    0
  )
  const peakFailedPerMinuteInWindow = series.reduce((max, point) => Math.max(max, point.failed), 0)
  const peakFinishedPerMinuteInWindow = series.reduce((max, point) => Math.max(max, point.total), 0)
  const longestFailureStreakMinutesInWindow = longestStreak(series, (point) => point.failed > 0)
  const longestCompletionStreakMinutesInWindow = longestStreak(
    series,
    (point) => point.completed > 0
  )

  const lifetimeCompleted = completedMetrics.meta.count
  const lifetimeFailed = failedMetrics.meta.count
  const lifetimeFinished = lifetimeCompleted + lifetimeFailed

  const counts = parseCounts(jobCountsRaw)
  const retainedPoints = Math.max(completedMetrics.count, failedMetrics.count)
  const oldestPointTimestamp = series.length > 0 ? series[0].timestamp : null
  const newestPointTimestamp = series.length > 0 ? series[series.length - 1].timestamp : null
  const latestPointAgeMs =
    newestPointTimestamp !== null ? Math.max(Date.now() - newestPointTimestamp, 0) : null
  const requestedWindowCoverage =
    requestedWindowMinutes && requestedWindowMinutes > 0
      ? Math.min(series.length / requestedWindowMinutes, 1)
      : null
  const estimatedDrainMinutes =
    avgFinishedPerMinuteInWindow > 0 ? waitingToProcess / avgFinishedPerMinuteInWindow : null

  return {
    queueName,
    range: {
      granularityMinutes: 1,
      requestedWindowMinutes,
      start,
      end,
      returnedPoints: series.length,
      newestFirst: false,
      retainedPoints,
      oldestPointTimestamp,
      newestPointTimestamp,
      latestPointAgeMs,
      requestedWindowCoverage,
    },
    series: {
      completed: completedMetrics,
      failed: failedMetrics,
      points: series,
      totals: {
        completedInWindow,
        failedInWindow,
        finishedInWindow,
        minutesInWindow,
        minutesWithCompletionsInWindow,
        minutesWithFailuresInWindow,
        minutesWithFinishedJobsInWindow,
        avgCompletedPerMinuteInWindow,
        avgFailedPerMinuteInWindow,
        avgFinishedPerMinuteInWindow,
        peakCompletedPerMinuteInWindow,
        peakFailedPerMinuteInWindow,
        peakFinishedPerMinuteInWindow,
        longestFailureStreakMinutesInWindow,
        longestCompletionStreakMinutesInWindow,
        successRateInWindow: finishedInWindow > 0 ? completedInWindow / finishedInWindow : 1,
        failureRateInWindow: finishedInWindow > 0 ? failedInWindow / finishedInWindow : 0,
        completedLifetime: lifetimeCompleted,
        failedLifetime: lifetimeFailed,
        finishedLifetime: lifetimeFinished,
        successRateLifetime: lifetimeFinished > 0 ? lifetimeCompleted / lifetimeFinished : 1,
        failureRateLifetime: lifetimeFinished > 0 ? lifetimeFailed / lifetimeFinished : 0,
        estimatedDrainMinutes,
      },
    },
    queue: {
      isPaused,
      isMaxed,
      waitingToProcess,
      workersCount,
      schedulersCount,
      workers: workers.map((worker) => normalizeClientSnapshot(worker)) as WorkerSnapshot[],
      queueEventsCount: queueEvents.length,
      queueEvents: queueEvents.map((event) =>
        normalizeClientSnapshot(event)
      ) as QueueEventClientSnapshot[],
    },
    counts,
    controls: {
      rateLimitTtlMs,
      rateLimited: rateLimitTtlMs > 0,
      globalConcurrency,
      globalRateLimit: parseGlobalRateLimit(globalRateLimit),
    },
    priorities: {
      sampled: priorities,
      counts: priorityCounts,
    },
    meta: parseMeta(queueMeta),
    prometheus: {
      included: includePrometheus,
      metrics: prometheusMetrics,
    },
    warnings,
  }
}

export async function collectQueueMcpMetricsSummary(
  queue: Queue,
  {
    queueName,
    windowMinutes,
  }: {
    queueName: string
    windowMinutes: number
  }
) {
  const requestedWindowMinutes = Math.min(
    Math.max(Math.floor(windowMinutes), 1),
    MCP_MAX_METRICS_WINDOW_MINUTES
  )
  const start = 0
  const end = Math.max(requestedWindowMinutes - 1, 0)

  const mcpWarnings: string[] = []
  const [
    completedMetrics,
    failedMetrics,
    jobCountsRaw,
    waitingToProcess,
    isPaused,
    isMaxed,
    workersCount,
    schedulersCount,
  ] = await Promise.all([
    queue.getMetrics('completed', start, end),
    queue.getMetrics('failed', start, end),
    queue.getJobCounts(),
    queue.count(),
    queue.isPaused(),
    safeCall(() => queue.isMaxed(), false, 'isMaxed unavailable', mcpWarnings),
    queue.getWorkersCount(),
    queue.getJobSchedulersCount(),
  ])

  const series = buildSeriesPoints(completedMetrics, failedMetrics, start)
  const completedInWindow = series.reduce((sum, point) => sum + point.completed, 0)
  const failedInWindow = series.reduce((sum, point) => sum + point.failed, 0)
  const finishedInWindow = completedInWindow + failedInWindow
  const minutesInWindow = series.length
  const avgFinishedPerMinuteInWindow = minutesInWindow > 0 ? finishedInWindow / minutesInWindow : 0
  const longestFailureStreakMinutesInWindow = longestStreak(series, (point) => point.failed > 0)
  const longestCompletionStreakMinutesInWindow = longestStreak(
    series,
    (point) => point.completed > 0
  )
  const lifetimeCompleted = completedMetrics.meta.count
  const lifetimeFailed = failedMetrics.meta.count
  const lifetimeFinished = lifetimeCompleted + lifetimeFailed

  return {
    queueName,
    range: {
      requestedWindowMinutes,
      returnedPoints: series.length,
      oldestPointTimestamp: series.length > 0 ? series[0].timestamp : null,
      newestPointTimestamp: series.length > 0 ? series[series.length - 1].timestamp : null,
      latestPointAgeMs:
        series.length > 0 ? Math.max(Date.now() - series[series.length - 1].timestamp, 0) : null,
      requestedWindowCoverage:
        requestedWindowMinutes > 0 ? Math.min(series.length / requestedWindowMinutes, 1) : null,
    },
    totals: {
      completedInWindow,
      failedInWindow,
      finishedInWindow,
      successRateInWindow: finishedInWindow > 0 ? completedInWindow / finishedInWindow : 1,
      failureRateInWindow: finishedInWindow > 0 ? failedInWindow / finishedInWindow : 0,
      avgCompletedPerMinuteInWindow: minutesInWindow > 0 ? completedInWindow / minutesInWindow : 0,
      avgFailedPerMinuteInWindow: minutesInWindow > 0 ? failedInWindow / minutesInWindow : 0,
      longestFailureStreakMinutesInWindow,
      longestCompletionStreakMinutesInWindow,
      completedLifetime: lifetimeCompleted,
      failedLifetime: lifetimeFailed,
      failureRateLifetime: lifetimeFinished > 0 ? lifetimeFailed / lifetimeFinished : 0,
      estimatedDrainMinutes:
        avgFinishedPerMinuteInWindow > 0 ? waitingToProcess / avgFinishedPerMinuteInWindow : null,
    },
    counts: parseCounts(jobCountsRaw),
    queue: {
      isPaused,
      isMaxed,
      waitingToProcess,
      workersCount,
      schedulersCount,
    },
    warnings: mcpWarnings.map(() => 'One or more queue metrics were unavailable.'),
  }
}
