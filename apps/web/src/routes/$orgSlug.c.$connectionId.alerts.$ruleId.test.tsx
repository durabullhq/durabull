import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditAlertRuleRoute } from '@/routes/$orgSlug.c.$connectionId.alerts.$ruleId'

type RulesQueryFixture = {
  isLoading: boolean
  data?: {
    rules: Array<{
      id: string
      organizationId: string
      connectionId: string
      queueName: null
      queueFilterMode: 'include'
      filterQueueNames: string[]
      name: string
      type: 'failure_threshold'
      config: { count: number; windowMinutes: number }
      enabled: boolean
      notificationChannels: []
      cooldownMinutes: number
    }>
  }
}

const {
  navigateMock,
  toastSuccessMock,
  updateRuleMutateAsyncMock,
  testRuleMutateAsyncMock,
  builderPropsSpy,
  routeState,
  rulesQueryState,
  saveInputsState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateRuleMutateAsyncMock: vi.fn(),
  testRuleMutateAsyncMock: vi.fn(),
  builderPropsSpy: vi.fn(),
  routeState: {
    params: {
      orgSlug: 'acme',
      connectionId: 'conn-1',
      ruleId: 'rule-1',
    },
  },
  rulesQueryState: {
    current: {
      isLoading: false,
      data: {
        rules: [
          {
            id: 'rule-1',
            organizationId: 'org-1',
            connectionId: 'conn-1',
            queueName: null,
            queueFilterMode: 'include' as const,
            filterQueueNames: ['email-send'],
            name: 'Delivery failures',
            type: 'failure_threshold' as const,
            config: { count: 5, windowMinutes: 5 },
            enabled: true,
            notificationChannels: [],
            cooldownMinutes: 30,
          },
        ],
      },
    } as RulesQueryFixture,
  },
  saveInputsState: {
    current: [
      {
        name: 'Delivery failures',
        type: 'failure_threshold' as const,
        queueFilterMode: 'include' as const,
        filterQueueNames: ['email-send'],
        config: { count: 10, windowMinutes: 5 },
        notificationChannels: [],
        cooldownMinutes: 45,
        enabled: true,
      },
    ],
  },
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => routeState.params,
  }),
  useNavigate: () => navigateMock,
}))

vi.mock('@/components/alerts/alert-rule-builder-page', () => ({
  AlertRuleBuilderPage: (props: Record<string, unknown>) => {
    builderPropsSpy(props)

    return (
      <div>
        <div>builder-mode:{String(props.mode)}</div>
        <button
          type="button"
          onClick={() =>
            void (props.onSave as (inputs: unknown[]) => Promise<void>)(saveInputsState.current)
          }
        >
          Save from builder
        </button>
        <button type="button" onClick={() => void (props.onTest as () => Promise<unknown>)?.()}>
          Test from builder
        </button>
      </div>
    )
  },
}))

vi.mock('@/components/connection-provider', () => ({
  useConnection: () => ({
    currentConnection: {
      id: 'conn-1',
      name: 'Primary Redis',
    },
  }),
}))

vi.mock('@/hooks/use-queues', () => ({
  useQueues: () => ({
    data: {
      queues: [{ name: 'email-send' }],
    },
  }),
}))

vi.mock('@/hooks/use-alerts', () => ({
  useConnectionAlertRules: () => rulesQueryState.current,
  useUpdateAlertRule: () => ({
    mutateAsync: updateRuleMutateAsyncMock,
    isPending: false,
  }),
  useTestAlertRule: () => ({
    mutateAsync: testRuleMutateAsyncMock,
    isPending: false,
  }),
  useLinearIntegration: () => ({
    data: {
      integration: {
        validationStatus: 'valid',
      },
    },
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
  },
}))

describe('EditAlertRuleRoute', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    toastSuccessMock.mockReset()
    updateRuleMutateAsyncMock.mockReset().mockResolvedValue(undefined)
    testRuleMutateAsyncMock.mockReset().mockResolvedValue({
      evaluation: {
        triggered: false,
        summary: '',
        context: {},
      },
      snapshot: {
        queueName: 'email-send',
        connectionName: 'Primary Redis',
        jobCounts: { failed: 0, waiting: 0, active: 0, completed: 100 },
        failedMetrics: { count: 0, dataPoints: [0] },
        completedMetrics: { count: 100, dataPoints: [100] },
      },
    })
    builderPropsSpy.mockReset()
    rulesQueryState.current = {
      isLoading: false,
      data: {
        rules: [
          {
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
        ],
      },
    }
  })

  it('shows loading and missing states before the builder renders', () => {
    rulesQueryState.current = {
      isLoading: true,
      data: undefined,
    }

    const { rerender } = render(<EditAlertRuleRoute />)

    expect(screen.getByText('Loading alert rule...')).toBeInTheDocument()

    rulesQueryState.current = {
      isLoading: false,
      data: {
        rules: [],
      },
    }

    rerender(<EditAlertRuleRoute />)

    expect(screen.getByText('Alert rule not found')).toBeInTheDocument()
  })

  it('wires test and save actions into the edit mutations and navigation', async () => {
    const user = userEvent.setup()

    render(<EditAlertRuleRoute />)

    expect(screen.getByText('builder-mode:edit')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Test from builder' }))
    expect(testRuleMutateAsyncMock).toHaveBeenCalledWith({ ruleId: 'rule-1', deliver: false })

    await user.click(screen.getByRole('button', { name: 'Save from builder' }))

    await waitFor(() =>
      expect(updateRuleMutateAsyncMock).toHaveBeenCalledWith({
        ruleId: 'rule-1',
        input: saveInputsState.current[0],
      })
    )
    expect(toastSuccessMock).toHaveBeenCalledWith('Alert rule updated', {
      description: 'Delivery failures is now enforcing the latest policy.',
    })
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/$orgSlug/c/$connectionId/alerts',
      params: { orgSlug: 'acme', connectionId: 'conn-1' },
      search: { tab: 'rules' },
    })
  })
})
