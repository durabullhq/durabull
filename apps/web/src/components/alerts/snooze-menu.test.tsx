import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SnoozeMenu } from '@/components/alerts/snooze-menu'
import type { AlertRuleRecord } from '@/hooks/use-alerts'

const {
  toastSuccessMock,
  toastErrorMock,
  useSnoozeAlertRuleMock,
  useUnsnoozeAlertRuleMock,
  snoozeMutateAsyncMock,
  unsnoozeMutateAsyncMock,
} = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  useSnoozeAlertRuleMock: vi.fn(),
  useUnsnoozeAlertRuleMock: vi.fn(),
  snoozeMutateAsyncMock: vi.fn(),
  unsnoozeMutateAsyncMock: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock('@/hooks/use-alerts', () => ({
  useSnoozeAlertRule: useSnoozeAlertRuleMock,
  useUnsnoozeAlertRule: useUnsnoozeAlertRuleMock,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}))

function buildRule(overrides: Partial<AlertRuleRecord> = {}): AlertRuleRecord {
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
    notificationChannels: [],
    cooldownMinutes: 30,
    mutedUntil: null,
    state: 'active',
    ...overrides,
  }
}

describe('SnoozeMenu', () => {
  beforeEach(() => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    snoozeMutateAsyncMock.mockReset().mockResolvedValue({
      rule: buildRule({
        mutedUntil: '2026-07-03T10:00:00.000Z',
        state: 'snoozed',
      }),
    })
    unsnoozeMutateAsyncMock.mockReset().mockResolvedValue({ rule: buildRule() })

    useSnoozeAlertRuleMock.mockReturnValue({
      mutateAsync: snoozeMutateAsyncMock,
      isPending: false,
    })
    useUnsnoozeAlertRuleMock.mockReturnValue({
      mutateAsync: unsnoozeMutateAsyncMock,
      isPending: false,
    })
  })

  it('renders the preset snooze options and snoozes with the preset minutes', async () => {
    const user = userEvent.setup()

    render(<SnoozeMenu rule={buildRule()} connectionId="conn-1" />)

    expect(screen.getByText('Snooze 1 hour')).toBeInTheDocument()
    expect(screen.getByText('Snooze 24 hours')).toBeInTheDocument()
    expect(screen.getByText('Snooze 7 days')).toBeInTheDocument()
    expect(screen.getByText('Custom…')).toBeInTheDocument()

    await user.click(screen.getByText('Snooze 24 hours'))

    await waitFor(() =>
      expect(snoozeMutateAsyncMock).toHaveBeenCalledWith({ ruleId: 'rule-1', minutes: 1440 })
    )
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining('Rule snoozed until'),
      expect.objectContaining({
        description: expect.stringContaining('Delivery failures'),
      })
    )
  })

  it('snoozes for a custom duration converted to minutes', async () => {
    const user = userEvent.setup()

    render(<SnoozeMenu rule={buildRule()} connectionId="conn-1" />)

    await user.click(screen.getByText('Custom…'))

    const amountInput = await screen.findByLabelText('Duration')
    await user.clear(amountInput)
    await user.type(amountInput, '2')
    await user.selectOptions(screen.getByLabelText('Unit'), 'days')
    await user.click(screen.getByRole('button', { name: 'Snooze' }))

    await waitFor(() =>
      expect(snoozeMutateAsyncMock).toHaveBeenCalledWith({ ruleId: 'rule-1', minutes: 2880 })
    )
  })

  it('rejects custom durations beyond the 7-day ceiling without mutating', async () => {
    const user = userEvent.setup()

    render(<SnoozeMenu rule={buildRule()} connectionId="conn-1" />)

    await user.click(screen.getByText('Custom…'))

    const amountInput = await screen.findByLabelText('Duration')
    await user.clear(amountInput)
    await user.type(amountInput, '8')
    await user.selectOptions(screen.getByLabelText('Unit'), 'days')
    await user.click(screen.getByRole('button', { name: 'Snooze' }))

    expect(
      await screen.findByText('Choose a duration between 1 minute and 7 days.')
    ).toBeInTheDocument()
    expect(snoozeMutateAsyncMock).not.toHaveBeenCalled()
  })

  it('hides Unsnooze for active rules and shows it for snoozed rules', async () => {
    const user = userEvent.setup()

    const { unmount } = render(<SnoozeMenu rule={buildRule()} connectionId="conn-1" />)
    expect(screen.queryByText('Unsnooze')).not.toBeInTheDocument()
    unmount()

    render(
      <SnoozeMenu
        rule={buildRule({ state: 'snoozed', mutedUntil: '2026-07-03T10:00:00.000Z' })}
        connectionId="conn-1"
      />
    )

    await user.click(screen.getByText('Unsnooze'))

    await waitFor(() => expect(unsnoozeMutateAsyncMock).toHaveBeenCalledWith('rule-1'))
    expect(toastSuccessMock).toHaveBeenCalledWith('Rule unsnoozed', {
      description: 'Delivery failures resumes checks on the next poll.',
    })
  })

  it('surfaces snooze failures as error toasts', async () => {
    const user = userEvent.setup()
    snoozeMutateAsyncMock.mockRejectedValue(new Error('Rule not found'))

    render(<SnoozeMenu rule={buildRule()} connectionId="conn-1" />)

    await user.click(screen.getByText('Snooze 1 hour'))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Failed to snooze rule', {
        description: 'Rule not found',
      })
    )
  })
})
