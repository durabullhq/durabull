import { expect, test } from 'bun:test'
import { inngestExecutions, triggerUsage } from './cost-model'

test('Trigger example includes invocation and executing compute', () => {
  expect(triggerUsage(1_000_000, 10).total).toBeCloseTo(363, 6)
  expect(triggerUsage(100_000_000, 10).total).toBeCloseTo(36_300, 6)
  expect(triggerUsage(1_000_000, 0).total).toBeCloseTo(25, 6)
  expect(triggerUsage(0, 10).total).toBe(0)
})
test('Inngest model counts the function run in addition to steps', () => {
  expect(inngestExecutions(1_000_000, 5)).toBe(6_000_000)
  expect(inngestExecutions(1_000_000, 0)).toBe(1_000_000)
})
