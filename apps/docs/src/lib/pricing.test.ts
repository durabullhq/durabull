import { describe, expect, test } from 'bun:test'
import { PLANS } from '../../../../packages/billing/src/catalog'
import { CLOUD_PLANS } from './pricing'

describe('published Cloud pricing', () => {
  test('matches the enforced billing catalog', () => {
    for (const plan of CLOUD_PLANS) {
      const enforced = PLANS[plan.code]
      expect(plan.name).toBe(enforced.name)
      expect(plan.monthlyPriceUsd).toBe(enforced.monthlyPriceUsd)
      expect(plan.annualPriceUsd).toBe(enforced.annualPriceUsd)
      expect(plan.limits).toEqual({
        connections: enforced.limits['connections.enabled'] ?? -1,
        members: enforced.limits['members.reserved'] ?? -1,
        alertRules: enforced.limits['alerts.enabled'] ?? -1,
        destinations: enforced.limits['alerts.destinations'] ?? -1,
        serviceAccounts: enforced.limits['service_accounts.enabled'] ?? -1,
        historyDays: enforced.limits['history.redis_health_days'] ?? -1,
      })
      expect(plan.features).toEqual({
        bulkRecovery: enforced.features.includes('jobs.bulk_recovery'),
        mcpWrites: enforced.features.includes('mcp.write'),
        webhookAlerts: enforced.features.includes('alerts.webhook'),
        linearAlerts: enforced.features.includes('alerts.linear'),
      })
      expect(plan.support).toBe(enforced.support)
    }
  })
})
