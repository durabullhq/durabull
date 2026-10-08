import { describe, expect, it } from 'bun:test'
import { healthSeries } from './health-series'

describe('Redis health chart measurements', () => {
  it('recognizes the nonempty buckets returned for an unsampled connection', () => {
    const result = healthSeries([
      { capturedAt: '2026-10-07T10:00:00Z', sampleCount: 0, memoryUsagePercent: null },
      { capturedAt: '2026-10-07T10:01:00Z', sampleCount: 0, memoryUsagePercent: null },
    ])
    expect(result.measured).toBe(0)
    expect(result.total).toBe(2)
    expect(result.points.map((point) => point.memoryUsagePercent)).toEqual([null, null])
  })

  it('preserves gaps and distinguishes a real zero from unavailable metrics', () => {
    const result = healthSeries([
      { sampleCount: 1, memoryUsagePercent: 0 },
      { sampleCount: 1, memoryUsagePercent: null },
      { sampleCount: 0, memoryUsagePercent: 40 },
      { sampleCount: 1, memoryUsagePercent: 50 },
      { sampleCount: 1, memoryUsagePercent: Number.NaN },
    ])
    expect(result.points.map((point) => point.memoryUsagePercent)).toEqual([
      0,
      null,
      null,
      50,
      null,
    ])
    expect(result.measured).toBe(2)
    expect(result.max).toBe(100)
  })

  it('reports returned coverage independently from the bounded chart window', () => {
    const result = healthSeries([
      { sampleCount: 1, memoryUsagePercent: 50 },
      ...Array.from({ length: 120 }, () => ({ sampleCount: 0, memoryUsagePercent: null })),
    ])
    expect(result.total).toBe(121)
    expect(result.measured).toBe(1)
    expect(result.points).toHaveLength(120)
    expect(result.displayedMeasured).toBe(0)
  })
})
