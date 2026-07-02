import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { Route } from '@/routes/$orgSlug.c.$connectionId.alerts.index'

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((options: Record<string, unknown>) => ({
    isRedirect: true,
    options,
  })),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  redirect: redirectMock,
  useNavigate: () => vi.fn(),
}))

vi.mock('@tanstack/zod-adapter', () => ({
  zodValidator: (schema: unknown) => schema,
}))

vi.mock('@/components/alerts/connection-incidents-view', () => ({
  ConnectionIncidentsView: () => null,
}))

type RouteFixture = {
  validateSearch: z.ZodTypeAny
  beforeLoad: (context: { search: Record<string, unknown>; params: Record<string, string> }) => void
}

const route = Route as unknown as RouteFixture

describe('connection alerts index route', () => {
  it('defaults invalid or missing search params to the open incidents view', () => {
    expect(route.validateSearch.parse({})).toEqual({ status: 'open' })
    expect(route.validateSearch.parse({ status: 'bogus' })).toEqual({ status: 'open' })
    expect(route.validateSearch.parse({ status: 'resolved', queue: 'email-send' })).toEqual({
      status: 'resolved',
      queue: 'email-send',
    })
  })

  it('redirects legacy ?tab=rules deep links to the rules route', () => {
    const params = { orgSlug: 'acme', connectionId: 'conn-1' }

    let thrown: unknown
    try {
      route.beforeLoad({ search: { status: 'open', tab: 'rules' }, params })
    } catch (error) {
      thrown = error
    }

    expect(redirectMock).toHaveBeenCalledWith({
      to: '/$orgSlug/c/$connectionId/alerts/rules',
      params,
      replace: true,
    })
    expect(thrown).toBeDefined()
  })

  it('does not redirect regular incident views', () => {
    expect(() =>
      route.beforeLoad({
        search: { status: 'open' },
        params: { orgSlug: 'acme', connectionId: 'conn-1' },
      })
    ).not.toThrow()
  })
})
