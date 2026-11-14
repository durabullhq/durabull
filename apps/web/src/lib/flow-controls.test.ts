import { describe, expect, it } from 'vitest'
import {
  diffFlowControls,
  formatFlowControlsSummary,
  formatRateLimit,
  formFromLimits,
  splitDuration,
  validateFlowControlsForm,
} from './flow-controls'

describe('splitDuration', () => {
  it('uses the largest whole unit', () => {
    expect(splitDuration(1_000)).toEqual({ amount: 1, unit: 's' })
    expect(splitDuration(90_000)).toEqual({ amount: 90, unit: 's' })
    expect(splitDuration(120_000)).toEqual({ amount: 2, unit: 'm' })
    expect(splitDuration(3_600_000)).toEqual({ amount: 1, unit: 'h' })
    expect(splitDuration(1_500)).toEqual({ amount: 1_500, unit: 'ms' })
  })
})

describe('formatting', () => {
  it('formats rate limits per unit', () => {
    expect(formatRateLimit({ max: 100, durationMs: 1_000 })).toBe('100 jobs / second')
    expect(formatRateLimit({ max: 5, durationMs: 30_000 })).toBe('5 jobs / 30 seconds')
  })

  it('summarizes active limits for the header', () => {
    expect(formatFlowControlsSummary(null)).toBeNull()
    expect(formatFlowControlsSummary({ globalConcurrency: null, globalRateLimit: null })).toBeNull()
    expect(
      formatFlowControlsSummary({
        globalConcurrency: 5,
        globalRateLimit: { max: 100, durationMs: 1_000 },
      })
    ).toBe('5 concurrent · 100/s')
    expect(
      formatFlowControlsSummary({
        globalConcurrency: null,
        globalRateLimit: { max: 10, durationMs: 300_000 },
      })
    ).toBe('10/5min')
  })
})

describe('validateFlowControlsForm', () => {
  it('round-trips server limits through the form', () => {
    const limits = { globalConcurrency: 3, globalRateLimit: { max: 20, durationMs: 60_000 } }
    const form = formFromLimits(limits)
    expect(form.rateLimitUnit).toBe('m')
    expect(validateFlowControlsForm(form).limits).toEqual(limits)
  })

  it('maps disabled controls to null', () => {
    const form = formFromLimits({
      globalConcurrency: 3,
      globalRateLimit: { max: 20, durationMs: 60_000 },
    })
    const result = validateFlowControlsForm({
      ...form,
      concurrencyEnabled: false,
      rateLimitEnabled: false,
    })
    expect(result.limits).toEqual({ globalConcurrency: null, globalRateLimit: null })
  })

  it('rejects invalid input', () => {
    const base = formFromLimits(null)
    expect(
      validateFlowControlsForm({ ...base, concurrencyEnabled: true, concurrency: '0' })
        .concurrencyError
    ).not.toBeNull()
    expect(
      validateFlowControlsForm({ ...base, concurrencyEnabled: true, concurrency: '2.5' }).limits
    ).toBeNull()
    const longWindow = validateFlowControlsForm({
      ...base,
      rateLimitEnabled: true,
      rateLimitMax: '10',
      rateLimitDuration: '25',
      rateLimitUnit: 'h',
    })
    expect(longWindow.rateLimitDurationError).not.toBeNull()
    expect(longWindow.limits).toBeNull()
  })
})

describe('diffFlowControls', () => {
  const current = { globalConcurrency: 5, globalRateLimit: { max: 10, durationMs: 1_000 } }

  it('returns nothing when unchanged', () => {
    expect(
      diffFlowControls(current, { ...current, globalRateLimit: { max: 10, durationMs: 1_000 } })
    ).toEqual({})
  })

  it('returns only changed controls', () => {
    expect(diffFlowControls(current, { ...current, globalConcurrency: null })).toEqual({
      globalConcurrency: null,
    })
    expect(
      diffFlowControls(current, { ...current, globalRateLimit: { max: 10, durationMs: 2_000 } })
    ).toEqual({ globalRateLimit: { max: 10, durationMs: 2_000 } })
  })
})
