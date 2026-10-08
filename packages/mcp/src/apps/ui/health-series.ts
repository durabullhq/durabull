type HealthPoint = {
  capturedAt: string
  sampleCount: number
  memoryUsagePercent: number | null
}

/** Preserve unsampled time buckets as gaps; null is never a zero measurement. */
export function healthSeries(value: unknown) {
  const points: HealthPoint[] = (Array.isArray(value) ? value : []).map((item) => {
    const row = item && typeof item === 'object' ? item : {}
    const count =
      typeof row.sampleCount === 'number' && Number.isFinite(row.sampleCount)
        ? Math.max(0, row.sampleCount)
        : 0
    return {
      capturedAt: typeof row.capturedAt === 'string' ? row.capturedAt : '',
      sampleCount: count,
      memoryUsagePercent:
        count > 0 &&
        typeof row.memoryUsagePercent === 'number' &&
        Number.isFinite(row.memoryUsagePercent)
          ? row.memoryUsagePercent
          : null,
    }
  })
  const measured = points.filter((point) => point.memoryUsagePercent !== null).length
  const displayed = points.slice(-120)
  return {
    points: displayed,
    measured,
    total: points.length,
    displayedMeasured: displayed.filter((point) => point.memoryUsagePercent !== null).length,
    max: Math.max(100, ...displayed.map((point) => point.memoryUsagePercent ?? 0)),
  }
}
