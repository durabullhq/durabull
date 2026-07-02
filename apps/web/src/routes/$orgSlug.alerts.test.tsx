import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { Route } from '@/routes/$orgSlug.alerts'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  useNavigate: () => vi.fn(),
}))

vi.mock('@tanstack/zod-adapter', () => ({
  zodValidator: (schema: unknown) => schema,
}))

vi.mock('@/components/alerts/org-alerts-feed', () => ({
  OrgAlertsFeed: () => null,
}))

type RouteFixture = {
  validateSearch: z.ZodTypeAny
}

const route = Route as unknown as RouteFixture

describe('org alerts route', () => {
  it('defaults invalid or missing search params to the open incident feed', () => {
    expect(route.validateSearch.parse({})).toEqual({ status: 'open' })
    expect(route.validateSearch.parse({ status: 'bogus' })).toEqual({ status: 'open' })
  })

  it('keeps valid status and connection filters', () => {
    expect(route.validateSearch.parse({ status: 'acknowledged', connection: 'conn-1' })).toEqual({
      status: 'acknowledged',
      connection: 'conn-1',
    })
  })
})
