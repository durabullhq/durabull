import { describe, expect, it, vi } from 'vitest'
import { Route } from '@/routes/$orgSlug.c.$connectionId.alerts.$ruleId'

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((options: Record<string, unknown>) => ({
    isRedirect: true,
    options,
  })),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  redirect: redirectMock,
}))

describe('legacy /alerts/$ruleId route', () => {
  it('redirects deep links to the rules sub-route', () => {
    const beforeLoad = (
      Route as unknown as {
        beforeLoad: (context: { params: Record<string, string> }) => void
      }
    ).beforeLoad

    const params = { orgSlug: 'acme', connectionId: 'conn-1', ruleId: 'rule-1' }

    let thrown: unknown
    try {
      beforeLoad({ params })
    } catch (error) {
      thrown = error
    }

    expect(redirectMock).toHaveBeenCalledWith({
      to: '/$orgSlug/c/$connectionId/alerts/rules/$ruleId',
      params,
      replace: true,
    })
    expect(thrown).toEqual({
      isRedirect: true,
      options: {
        to: '/$orgSlug/c/$connectionId/alerts/rules/$ruleId',
        params,
        replace: true,
      },
    })
  })
})
