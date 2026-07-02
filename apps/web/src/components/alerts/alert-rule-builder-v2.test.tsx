import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertRuleBuilder } from '@/components/alerts/alert-rule-builder-v2'
import type { AlertRuleRecord } from '@/hooks/use-alerts'

const { toastSuccessMock, toastErrorMock, useAlertDestinationsMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  useAlertDestinationsMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params: _params,
    search: _search,
    ...props
  }: {
    children?: ReactNode
    to?: string
  } & Record<string, unknown>) => (
    <a href={String(to ?? '#')} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/components/app-top-bar', () => ({
  useAppTopBar: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock('@/hooks/use-alerts', () => ({
  useTestWebhook: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAlertDestinations: useAlertDestinationsMock,
  useLinearMetadata: () => ({ data: undefined, isLoading: false }),
}))

function createRule(overrides: Partial<AlertRuleRecord> = {}): AlertRuleRecord {
  return {
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
    notificationChannels: [{ type: 'email', target: 'ops@example.com' }],
    cooldownMinutes: 30,
    mutedUntil: null,
    state: 'active',
    ...overrides,
  }
}

function renderBuilder(props: Partial<ComponentProps<typeof AlertRuleBuilder>> = {}) {
  return render(
    <AlertRuleBuilder
      mode="create"
      orgSlug="acme"
      connectionId="conn-1"
      connectionName="Primary Redis"
      availableQueues={['email-send', 'invoice-send']}
      onSave={vi.fn().mockResolvedValue(undefined)}
      {...props}
    />
  )
}

describe('AlertRuleBuilder', () => {
  beforeEach(() => {
    useAlertDestinationsMock.mockReturnValue({
      data: { destinations: [] },
      isLoading: false,
    })
  })

  it('shows the template picker in create mode and collapses it after a choice', async () => {
    const user = userEvent.setup()

    renderBuilder()

    expect(screen.getByText('Start from a template')).toBeInTheDocument()

    await user.click(screen.getByTestId('rule-template-failure-spike'))

    expect(screen.queryByText('Start from a template')).not.toBeInTheDocument()
    expect(screen.getByText(/Started from:/)).toBeInTheDocument()
    expect(screen.getByText('Failure spike')).toBeInTheDocument()
    expect(screen.getByTestId('sentence-token-condition')).toHaveTextContent(
      '≥ 25 new failures within 5 min'
    )
    expect(screen.getByTestId('sentence-token-queues')).toHaveTextContent('all queues')
  })

  it('preselects a template via the search param and skips the picker', () => {
    renderBuilder({ initialTemplateKey: 'error-rate' })

    expect(screen.queryByText('Start from a template')).not.toBeInTheDocument()
    expect(screen.getByText(/Started from:/)).toBeInTheDocument()
    expect(screen.getByText('Elevated error rate')).toBeInTheDocument()
    expect(screen.getByTestId('sentence-token-condition')).toHaveTextContent(
      'failure rate ≥ 10% over 15 min (min 250 jobs)'
    )
  })

  it('updates the sentence live as condition fields change', async () => {
    const user = userEvent.setup()

    renderBuilder({ initialTemplateKey: 'failure-spike' })

    const countInput = screen.getByLabelText('New failures')
    await user.clear(countInput)
    await user.type(countInput, '50')

    expect(screen.getByTestId('sentence-token-condition')).toHaveTextContent(
      '≥ 50 new failures within 5 min'
    )
  })

  it('blocks save, shows inline errors, and marks the first errored field', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    const { container } = renderBuilder({ initialTemplateKey: 'failure-spike', onSave })

    await user.click(screen.getByRole('button', { name: 'Create rule' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Rule name is required.')).toBeInTheDocument()
    expect(screen.getByTestId('alert-rule-form-error')).toHaveTextContent(
      'Fix the highlighted fields before saving.'
    )
    expect(container.querySelector('[data-field-error]')).not.toBeNull()
  })

  it('only shows validation errors for touched fields before submit', async () => {
    const user = userEvent.setup()

    renderBuilder({ initialTemplateKey: 'failure-spike' })

    expect(screen.queryByText('Rule name is required.')).not.toBeInTheDocument()

    const nameInput = screen.getByTestId('alert-rule-name-input')
    await user.click(nameInput)
    await user.tab()

    expect(screen.getByText('Rule name is required.')).toBeInTheDocument()
  })

  it('loads a duplicate-from rule as a copy and skips the picker', () => {
    renderBuilder({ duplicateFrom: createRule() })

    expect(screen.queryByText('Start from a template')).not.toBeInTheDocument()
    expect(screen.getByText(/Started from:/)).toBeInTheDocument()
    expect(screen.getByTestId('alert-rule-name-input')).toHaveValue('Delivery failures (copy)')
    expect(screen.getByTestId('sentence-token-queues')).toHaveTextContent('email-send')
  })

  it('serializes and saves an edited rule', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)

    renderBuilder({ mode: 'edit', rule: createRule(), onSave })

    const nameInput = screen.getByTestId('alert-rule-name-input')
    await user.clear(nameInput)
    await user.type(nameInput, 'Renamed delivery failures')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith([
      {
        name: 'Renamed delivery failures',
        type: 'failure_threshold',
        queueName: null,
        queueFilterMode: 'include',
        filterQueueNames: ['email-send'],
        enabled: true,
        cooldownMinutes: 30,
        notificationChannels: [{ type: 'email', target: 'ops@example.com' }],
        config: {
          count: 5,
          windowMinutes: 5,
        },
      },
    ])
  })

  it('routes to saved destinations via the multi-select and serializes destination channels', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    useAlertDestinationsMock.mockReturnValue({
      data: {
        destinations: [
          {
            id: 'dest-1',
            organizationId: 'org-1',
            name: 'On-call pipeline',
            type: 'webhook',
            url: 'https://example.com/hook',
            config: {},
            enabled: true,
            secretConfigured: false,
            inUseByRuleCount: 0,
          },
        ],
      },
      isLoading: false,
    })

    renderBuilder({ mode: 'edit', rule: createRule(), onSave })

    await user.click(screen.getByTestId('destination-multi-select-trigger'))
    await user.click(screen.getByRole('button', { name: 'On-call pipeline' }))

    expect(screen.getByTestId('sentence-token-routes')).toHaveTextContent('On-call pipeline')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0][0].notificationChannels).toEqual([
      { type: 'email', target: 'ops@example.com' },
      { type: 'destination', destinationId: 'dest-1' },
    ])
  })

  it('renders legacy saved-webhook channels as read-only chips and serializes them unchanged', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    useAlertDestinationsMock.mockReturnValue({
      data: {
        destinations: [
          {
            id: 'dest-legacy',
            organizationId: 'org-1',
            name: 'Legacy hook',
            type: 'webhook',
            url: 'https://example.com/legacy',
            config: {},
            enabled: true,
            secretConfigured: false,
            inUseByRuleCount: 1,
          },
        ],
      },
      isLoading: false,
    })

    renderBuilder({
      mode: 'edit',
      rule: createRule({
        notificationChannels: [{ type: 'webhook', destinationId: 'dest-legacy' }],
      }),
      onSave,
    })

    expect(screen.getByText('Legacy hook')).toBeInTheDocument()
    expect(screen.getByText(/Legacy saved webhook/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0][0].notificationChannels).toEqual([
      { type: 'webhook', destinationId: 'dest-legacy' },
    ])
  })

  it('offers a duplicate link in edit mode', () => {
    renderBuilder({ mode: 'edit', rule: createRule() })

    expect(screen.getByRole('link', { name: /Duplicate/ })).toBeInTheDocument()
  })

  it('runs a live test in edit mode and surfaces the result', async () => {
    const user = userEvent.setup()
    const onTest = vi.fn().mockResolvedValue({
      evaluation: {
        triggered: true,
        summary: 'Rule would fire for email-send',
        context: { delta: 12 },
      },
      snapshot: {
        queueName: 'email-send',
        connectionName: 'Primary Redis',
        jobCounts: { failed: 12, waiting: 1, active: 0, completed: 80 },
        failedMetrics: { count: 12, dataPoints: [7, 5] },
        completedMetrics: { count: 80, dataPoints: [40, 40] },
      },
    })

    renderBuilder({ mode: 'edit', rule: createRule(), onTest })

    await user.click(screen.getByRole('button', { name: 'Run live test' }))

    await waitFor(() => expect(onTest).toHaveBeenCalledTimes(1))
    expect(toastSuccessMock).toHaveBeenCalledWith('Rule would fire right now', {
      description: 'Rule would fire for email-send',
    })
    expect(screen.getByText('Latest live test')).toBeInTheDocument()
    expect(screen.getByText('Rule would fire for email-send')).toBeInTheDocument()
  })
})
