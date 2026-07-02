import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getOpenAlertCount,
  useAcknowledgeAlertEvent,
  useConnectionAlertRules,
  useCreateAlertRule,
  useGlobalAlertEvents,
  useResolveAlertEvent,
  useSnoozeAlertRule,
  useUnsnoozeAlertRule,
} from '@/hooks/use-alerts'

const {
  summaryGetMock,
  globalEventsGetMock,
  connectionRulesGetMock,
  connectionEventsGetMock,
  createRulePostMock,
  updateRulePatchMock,
  deleteRuleDeleteMock,
  resolveEventPostMock,
  acknowledgeEventPostMock,
  acknowledgeEventDeleteMock,
  snoozeRulePostMock,
  snoozeRuleDeleteMock,
  testRulePostMock,
  handleResMock,
} = vi.hoisted(() => ({
  summaryGetMock: vi.fn(),
  globalEventsGetMock: vi.fn(),
  connectionRulesGetMock: vi.fn(),
  connectionEventsGetMock: vi.fn(),
  createRulePostMock: vi.fn(),
  updateRulePatchMock: vi.fn(),
  deleteRuleDeleteMock: vi.fn(),
  resolveEventPostMock: vi.fn(),
  acknowledgeEventPostMock: vi.fn(),
  acknowledgeEventDeleteMock: vi.fn(),
  snoozeRulePostMock: vi.fn(),
  snoozeRuleDeleteMock: vi.fn(),
  testRulePostMock: vi.fn(),
  handleResMock: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    alerts: {
      summary: {
        $get: summaryGetMock,
      },
      events: {
        $get: globalEventsGetMock,
      },
    },
    c: {
      ':connectionId': {
        alerts: {
          rules: {
            $get: connectionRulesGetMock,
            $post: createRulePostMock,
            ':ruleId': {
              $patch: updateRulePatchMock,
              $delete: deleteRuleDeleteMock,
              snooze: {
                $post: snoozeRulePostMock,
                $delete: snoozeRuleDeleteMock,
              },
              test: {
                $post: testRulePostMock,
              },
            },
          },
          events: {
            $get: connectionEventsGetMock,
            ':eventId': {
              resolve: {
                $post: resolveEventPostMock,
              },
              acknowledge: {
                $post: acknowledgeEventPostMock,
                $delete: acknowledgeEventDeleteMock,
              },
            },
          },
        },
      },
    },
  },
  handleRes: handleResMock,
}))

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('getOpenAlertCount', () => {
  it('returns org-wide total when connectionId is omitted, preferring open over legacy count', () => {
    expect(
      getOpenAlertCount([
        { connectionId: 'conn-a', firing: 1, acknowledged: 1, open: 2, count: 99 },
        { connectionId: 'conn-b', firing: 1, acknowledged: 0, open: 1, count: 1 },
      ])
    ).toBe(3)
  })

  it('returns only the selected connection count when connectionId is provided', () => {
    expect(
      getOpenAlertCount(
        [
          { connectionId: 'conn-a', firing: 2, acknowledged: 0, open: 2, count: 2 },
          { connectionId: 'conn-b', firing: 0, acknowledged: 1, open: 1, count: 1 },
        ],
        'conn-b'
      )
    ).toBe(1)
  })

  it('returns zero when the connection has no open incidents', () => {
    expect(
      getOpenAlertCount(
        [{ connectionId: 'conn-a', firing: 2, acknowledged: 0, open: 2, count: 2 }],
        'conn-missing'
      )
    ).toBe(0)
  })
})

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

describe('use-alerts', () => {
  beforeEach(() => {
    summaryGetMock.mockReset()
    globalEventsGetMock.mockReset()
    connectionRulesGetMock.mockReset()
    connectionEventsGetMock.mockReset()
    createRulePostMock.mockReset()
    updateRulePatchMock.mockReset()
    deleteRuleDeleteMock.mockReset()
    resolveEventPostMock.mockReset()
    acknowledgeEventPostMock.mockReset()
    acknowledgeEventDeleteMock.mockReset()
    snoozeRulePostMock.mockReset()
    snoozeRuleDeleteMock.mockReset()
    testRulePostMock.mockReset()
    handleResMock.mockReset()
  })

  it('normalizes connection rules returned from the API', async () => {
    const queryClient = createQueryClient()
    connectionRulesGetMock.mockResolvedValue({ ok: true })
    handleResMock.mockResolvedValue({
      rules: [
        {
          id: 'rule-1',
          organizationId: 'org-1',
          connectionId: 'conn-1',
          queueName: 42,
          queueFilterMode: 'bogus',
          filterQueueNames: ['email-send', 123],
          name: 99,
          type: 'totally_unknown',
          config: null,
          enabled: undefined,
          notificationChannels: [
            { type: 'email', target: 'ops@example.com' },
            { type: 'slack', target: '#ops' },
          ],
          cooldownMinutes: 'bad',
        },
      ],
    })

    const { result } = renderHook(() => useConnectionAlertRules('conn-1'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.data?.rules).toHaveLength(1))

    expect(connectionRulesGetMock).toHaveBeenCalledWith({
      param: { connectionId: 'conn-1' },
    })
    expect(result.current.data?.rules[0]).toEqual({
      id: 'rule-1',
      organizationId: 'org-1',
      connectionId: 'conn-1',
      queueName: null,
      queueFilterMode: null,
      filterQueueNames: ['email-send'],
      name: 'Alert rule',
      type: 'failure_threshold',
      config: {},
      enabled: true,
      notificationChannels: [{ type: 'email', target: 'ops@example.com' }],
      cooldownMinutes: 30,
      mutedUntil: null,
      state: 'active',
      createdAt: undefined,
      updatedAt: undefined,
    })
  })

  it('normalizes global alert events and forwards query filters', async () => {
    const queryClient = createQueryClient()
    globalEventsGetMock.mockResolvedValue({ ok: true })
    handleResMock.mockResolvedValue({
      events: [
        {
          id: 'event-1',
          alertRuleId: 'rule-1',
          organizationId: 'org-1',
          connectionId: 'conn-1',
          queueName: 'email-send',
          type: 'unknown-type',
          status: 'not-a-status',
          summary: null,
          context: null,
          firedAt: null,
          resolvedAt: '2026-03-24T10:00:00.000Z',
          notificationSentAt: undefined,
        },
      ],
    })

    const { result } = renderHook(
      () => useGlobalAlertEvents({ status: 'resolved', limit: 20, offset: 5 }),
      {
        wrapper: createWrapper(queryClient),
      }
    )

    await waitFor(() => expect(result.current.data?.events).toHaveLength(1))

    expect(globalEventsGetMock).toHaveBeenCalledWith({
      query: {
        limit: '20',
        offset: '5',
        status: 'resolved',
      },
    })
    expect(result.current.data?.events[0]).toMatchObject({
      id: 'event-1',
      type: 'failure_threshold',
      status: 'firing',
      summary: '',
      context: {},
      resolvedAt: '2026-03-24T10:00:00.000Z',
      notificationSentAt: null,
    })
  })

  it('invalidates summary, global, and connection queries after creating a rule', async () => {
    const queryClient = createQueryClient()
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

    createRulePostMock.mockResolvedValue({ ok: true })
    handleResMock.mockResolvedValue({
      rule: {
        id: 'rule-1',
        organizationId: 'org-1',
        connectionId: 'conn-1',
        queueName: null,
        queueFilterMode: 'include',
        filterQueueNames: ['email-send'],
        name: 'Delivery failures',
        type: 'failure_threshold',
        config: { count: 5, windowMinutes: 5 },
        enabled: true,
        notificationChannels: [],
        cooldownMinutes: 30,
      },
    })

    const { result } = renderHook(() => useCreateAlertRule('conn-1'), {
      wrapper: createWrapper(queryClient),
    })

    await result.current.mutateAsync({
      name: 'Delivery failures',
      type: 'failure_threshold',
      queueFilterMode: 'include',
      filterQueueNames: ['email-send'],
      config: { count: 5, windowMinutes: 5 },
      notificationChannels: [],
      cooldownMinutes: 30,
      enabled: true,
    })

    expect(createRulePostMock).toHaveBeenCalledWith({
      param: { connectionId: 'conn-1' },
      json: {
        name: 'Delivery failures',
        type: 'failure_threshold',
        queueFilterMode: 'include',
        filterQueueNames: ['email-send'],
        config: { count: 5, windowMinutes: 5 },
        notificationChannels: [],
        cooldownMinutes: 30,
        enabled: true,
      },
    })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['alerts', 'summary'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['alerts', 'global-events'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['alerts', 'connection', 'conn-1'],
    })
  })

  it('snoozes a rule, normalizes the snoozed state, and invalidates alert queries', async () => {
    const queryClient = createQueryClient()
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const mutedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    snoozeRulePostMock.mockResolvedValue({ ok: true })
    handleResMock.mockResolvedValue({
      rule: {
        id: 'rule-1',
        organizationId: 'org-1',
        connectionId: 'conn-1',
        queueName: null,
        queueFilterMode: 'include',
        filterQueueNames: ['email-send'],
        name: 'Delivery failures',
        type: 'failure_threshold',
        config: { count: 5, windowMinutes: 5 },
        enabled: true,
        notificationChannels: [],
        cooldownMinutes: 30,
        mutedUntil,
        state: 'snoozed',
      },
    })

    const { result } = renderHook(() => useSnoozeAlertRule('conn-1'), {
      wrapper: createWrapper(queryClient),
    })

    const data = await result.current.mutateAsync({ ruleId: 'rule-1', minutes: 60 })

    expect(snoozeRulePostMock).toHaveBeenCalledWith({
      param: { connectionId: 'conn-1', ruleId: 'rule-1' },
      json: { minutes: 60 },
    })
    expect(data.rule).toMatchObject({ mutedUntil, state: 'snoozed' })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['alerts', 'summary'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['alerts', 'global-events'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['alerts', 'connection', 'conn-1'],
    })
  })

  it('unsnoozes a rule via DELETE and invalidates connection queries', async () => {
    const queryClient = createQueryClient()
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

    snoozeRuleDeleteMock.mockResolvedValue({ ok: true })
    handleResMock.mockResolvedValue({
      rule: {
        id: 'rule-1',
        organizationId: 'org-1',
        connectionId: 'conn-1',
        queueName: null,
        queueFilterMode: 'include',
        filterQueueNames: ['email-send'],
        name: 'Delivery failures',
        type: 'failure_threshold',
        config: { count: 5, windowMinutes: 5 },
        enabled: true,
        notificationChannels: [],
        cooldownMinutes: 30,
        mutedUntil: null,
        state: 'active',
      },
    })

    const { result } = renderHook(() => useUnsnoozeAlertRule('conn-1'), {
      wrapper: createWrapper(queryClient),
    })

    const data = await result.current.mutateAsync('rule-1')

    expect(snoozeRuleDeleteMock).toHaveBeenCalledWith({
      param: { connectionId: 'conn-1', ruleId: 'rule-1' },
    })
    expect(data.rule).toMatchObject({ mutedUntil: null, state: 'active' })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['alerts', 'connection', 'conn-1'],
    })
  })

  it('acknowledges an event, normalizes ack provenance, and invalidates alert queries', async () => {
    const queryClient = createQueryClient()
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

    acknowledgeEventPostMock.mockResolvedValue({ ok: true })
    handleResMock.mockResolvedValue({
      event: {
        id: 'event-1',
        alertRuleId: 'rule-1',
        organizationId: 'org-1',
        connectionId: 'conn-1',
        queueName: 'email-send',
        type: 'failure_threshold',
        status: 'firing',
        summary: '12 jobs failed',
        context: {},
        firedAt: '2026-03-24T09:00:00.000Z',
        acknowledgedAt: '2026-03-24T09:02:00.000Z',
        acknowledgedBy: 'user-1',
        acknowledgedByName: 'Sam Operator',
      },
    })

    const { result } = renderHook(() => useAcknowledgeAlertEvent('conn-1'), {
      wrapper: createWrapper(queryClient),
    })

    const data = await result.current.mutateAsync('event-1')

    expect(acknowledgeEventPostMock).toHaveBeenCalledWith({
      param: { connectionId: 'conn-1', eventId: 'event-1' },
    })
    expect(data.event).toMatchObject({
      status: 'firing',
      acknowledgedAt: '2026-03-24T09:02:00.000Z',
      acknowledgedBy: 'user-1',
      acknowledgedByName: 'Sam Operator',
    })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['alerts', 'summary'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['alerts', 'global-events'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['alerts', 'connection', 'conn-1'],
    })
  })

  it('invalidates the same query families after resolving an alert event', async () => {
    const queryClient = createQueryClient()
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

    resolveEventPostMock.mockResolvedValue({ ok: true })
    handleResMock.mockResolvedValue({
      event: {
        id: 'event-1',
        alertRuleId: 'rule-1',
        organizationId: 'org-1',
        connectionId: 'conn-1',
        queueName: 'email-send',
        type: 'failure_threshold',
        status: 'resolved',
        summary: 'Resolved',
        context: {},
        firedAt: '2026-03-24T09:00:00.000Z',
        resolvedAt: '2026-03-24T09:05:00.000Z',
      },
    })

    const { result } = renderHook(() => useResolveAlertEvent(), {
      wrapper: createWrapper(queryClient),
    })

    await result.current.mutateAsync({
      connectionId: 'conn-1',
      eventId: 'event-1',
    })

    expect(resolveEventPostMock).toHaveBeenCalledWith({
      param: { connectionId: 'conn-1', eventId: 'event-1' },
    })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['alerts', 'summary'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['alerts', 'global-events'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['alerts', 'connection', 'conn-1'],
    })
  })
})
