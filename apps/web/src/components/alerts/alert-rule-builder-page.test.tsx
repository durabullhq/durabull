import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AlertRuleBuilderPage } from '@/components/alerts/alert-rule-builder-page'
import type { AlertRuleRecord } from '@/hooks/use-alerts'

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    href = '#',
    ...props
  }: { children?: ReactNode; href?: string } & Record<string, unknown>) => (
    <a href={href} {...props}>
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
    ...overrides,
  }
}

describe('AlertRuleBuilderPage', () => {
  it('blocks save when validation fails', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    render(
      <AlertRuleBuilderPage
        mode="create"
        orgSlug="acme"
        connectionId="conn-1"
        connectionName="Primary Redis"
        availableQueues={['email-send']}
        onSave={onSave}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Create rule' }))

    expect(screen.getByText('Rule name is required.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('serializes the draft and calls onSave for a valid rule', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)

    render(
      <AlertRuleBuilderPage
        mode="create"
        orgSlug="acme"
        connectionId="conn-1"
        connectionName="Primary Redis"
        availableQueues={['email-send', 'invoice-send']}
        onSave={onSave}
      />
    )

    await user.type(screen.getByTestId('alert-rule-name-input'), 'Email delivery failures')
    await user.click(screen.getByRole('button', { name: /select queue names/i }))
    await user.click(screen.getByRole('button', { name: /^email-send$/i }))
    await user.click(screen.getByRole('button', { name: 'Create rule' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith({
      name: 'Email delivery failures',
      type: 'failure_threshold',
      queueName: null,
      queueFilterMode: 'include',
      filterQueueNames: ['email-send'],
      enabled: true,
      cooldownMinutes: 30,
      notificationChannels: [],
      config: {
        count: 25,
        windowMinutes: 5,
      },
    })
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

    render(
      <AlertRuleBuilderPage
        mode="edit"
        orgSlug="acme"
        connectionId="conn-1"
        connectionName="Primary Redis"
        availableQueues={['email-send']}
        rule={createRule()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onTest={onTest}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Run live test' }))

    await waitFor(() => expect(onTest).toHaveBeenCalledTimes(1))
    expect(toastSuccessMock).toHaveBeenCalledWith('Rule would fire right now', {
      description: 'Rule would fire for email-send',
    })
    expect(screen.getByText('Latest live test')).toBeInTheDocument()
    expect(screen.getByText('Rule would fire for email-send')).toBeInTheDocument()
  })
})
