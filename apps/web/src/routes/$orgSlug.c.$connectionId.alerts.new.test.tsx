import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateAlertRuleRoute } from '@/routes/$orgSlug.c.$connectionId.alerts.new'

const {
  navigateMock,
  toastSuccessMock,
  createRuleMutateAsyncMock,
  builderPropsSpy,
  routeState,
  saveInputState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  createRuleMutateAsyncMock: vi.fn(),
  builderPropsSpy: vi.fn(),
  routeState: {
    params: {
      orgSlug: 'acme',
      connectionId: 'conn-1',
    },
  },
  saveInputState: {
    current: {
      name: 'Email failures',
      type: 'failure_threshold' as const,
      queueFilterMode: 'include' as const,
      filterQueueNames: ['email-send'],
      config: { count: 5, windowMinutes: 5 },
      notificationChannels: [],
      cooldownMinutes: 30,
      enabled: true,
    },
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
        <div>builder-queues:{(props.availableQueues as string[]).join(',')}</div>
        <button
          type="button"
          onClick={() =>
            void (props.onSave as (input: unknown) => Promise<void>)(saveInputState.current)
          }
        >
          Save from builder
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
      queues: [{ name: 'email-send' }, { name: 'invoice-send' }],
    },
  }),
}))

vi.mock('@/hooks/use-alerts', () => ({
  useCreateAlertRule: () => ({
    mutateAsync: createRuleMutateAsyncMock,
    isPending: false,
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
  },
}))

describe('CreateAlertRuleRoute', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    toastSuccessMock.mockReset()
    createRuleMutateAsyncMock.mockReset().mockResolvedValue(undefined)
    builderPropsSpy.mockReset()
  })

  it('wires builder saves into create mutations, toast copy, and navigation', async () => {
    const user = userEvent.setup()

    render(<CreateAlertRuleRoute />)

    expect(screen.getByText('builder-mode:create')).toBeInTheDocument()
    expect(screen.getByText('builder-queues:email-send,invoice-send')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save from builder' }))

    await waitFor(() => expect(createRuleMutateAsyncMock).toHaveBeenCalledTimes(1))
    expect(createRuleMutateAsyncMock).toHaveBeenCalledWith(saveInputState.current)
    expect(toastSuccessMock).toHaveBeenCalledWith('Alert rule created', {
      description: 'Email failures is now being evaluated in the background.',
    })
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/$orgSlug/c/$connectionId/alerts',
      params: { orgSlug: 'acme', connectionId: 'conn-1' },
      search: { tab: 'rules' },
    })
  })
})
