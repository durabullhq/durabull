import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The setup file replaces this hook for component tests; here the real one runs.
vi.unmock('@/hooks/use-entitlement')

const { configState, entitlementGetMock, handleResMock } = vi.hoisted(() => ({
  configState: { billingEnabled: true },
  entitlementGetMock: vi.fn(),
  handleResMock: vi.fn(),
}))

vi.mock('@/hooks/use-app-config', () => ({
  useAppConfig: () => ({ config: { billing: { enabled: configState.billingEnabled } } }),
}))
vi.mock('@/hooks/use-organization', () => ({
  useActiveOrganization: () => ({ data: { id: 'org-1', slug: 'acme' } }),
}))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: { billing: { entitlement: { $get: entitlementGetMock } } },
    handleRes: handleResMock,
  }
})

import { useEntitlement } from '@/hooks/use-entitlement'
import { ApiError } from '@/lib/api'

function wrapper({ children }: PropsWithChildren) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

const FREE_PLAN = {
  enabled: true,
  enforced: true,
  planCode: 'free',
  planName: 'Free',
  subscribedPlanCode: null,
  source: 'free',
  degraded: false,
  notices: [],
  features: [],
  limits: {
    'connections.enabled': 1,
    'members.reserved': 2,
    'alerts.enabled': 3,
    'alerts.destinations': 1,
    'service_accounts.enabled': 0,
    'history.redis_health_days': 1,
  },
  usage: { 'connections.enabled': 1, 'members.reserved': 1 },
  suspended: [{ kind: 'connection', id: 'c2' }],
  subscription: null,
  graceExpiresAt: null,
  capacityAdjustmentExpiresAt: null,
  canManageBilling: true,
  transition: null,
}

describe('useEntitlement', () => {
  beforeEach(() => {
    configState.billingEnabled = true
    entitlementGetMock.mockReset().mockResolvedValue({})
    handleResMock.mockReset()
  })

  it('never asks the server and restricts nothing without Cloud billing', () => {
    configState.billingEnabled = false
    const { result } = renderHook(() => useEntitlement(), { wrapper })
    expect(entitlementGetMock).not.toHaveBeenCalled()
    expect(result.current.restricted).toBe(false)
    expect(result.current.can('alerts.webhook')).toBe(true)
    expect(result.current.capacity('connections.enabled').atLimit).toBe(false)
    expect(result.current.plan).toBeNull()
  })

  it('restricts nothing until the first answer arrives', () => {
    handleResMock.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useEntitlement(), { wrapper })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.can('alerts.webhook')).toBe(true)
    expect(result.current.canAdd('connections.enabled')).toBe(true)
  })

  it('answers feature, capacity and paused questions from the plan', async () => {
    handleResMock.mockResolvedValue(FREE_PLAN)
    const { result } = renderHook(() => useEntitlement(), { wrapper })
    await waitFor(() => expect(result.current.plan).not.toBeNull())

    expect(result.current.restricted).toBe(true)
    expect(result.current.can('alerts.webhook')).toBe(false)
    expect(result.current.feature('alerts.webhook').requiredPlan).toBe('team')
    expect(result.current.capacity('connections.enabled')).toMatchObject({
      used: 1,
      limit: 1,
      atLimit: true,
      requiredPlan: 'team',
    })
    expect(result.current.canAdd('members.reserved')).toBe(true)
    expect(result.current.isPaused('connection', 'c2')).toBe(true)
    expect(result.current.isPaused('connection', 'c1')).toBe(false)
    expect(result.current.canManageBilling).toBe(true)
    expect(result.current.seatPaused).toBe(false)
  })

  it('does not restrict an organization that is only observed', async () => {
    handleResMock.mockResolvedValue({ ...FREE_PLAN, enforced: false, suspended: [] })
    const { result } = renderHook(() => useEntitlement(), { wrapper })
    await waitFor(() => expect(result.current.plan).not.toBeNull())
    expect(result.current.restricted).toBe(false)
    expect(result.current.can('alerts.webhook')).toBe(true)
    expect(result.current.capacity('connections.enabled').limit).toBeNull()
  })

  it('recognizes that the member’s own seat is paused', async () => {
    handleResMock.mockRejectedValue(
      new ApiError('Your seat is paused', 403, { code: 'member_suspended' })
    )
    const { result } = renderHook(() => useEntitlement(), { wrapper })
    await waitFor(() => expect(result.current.seatPaused).toBe(true))
    expect(result.current.plan).toBeNull()
  })
})
