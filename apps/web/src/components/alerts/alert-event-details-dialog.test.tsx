import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertEventDetailsDialog } from '@/components/alerts/alert-event-details-dialog'
import type { AlertDeliveryRecord, AlertEventRecord } from '@/hooks/use-alerts'

const { mutateAsync, retryState, toastSuccess, toastError } = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => ({})),
  retryState: {
    mutateAsync: undefined as unknown,
    isPending: false,
    variables: undefined as { deliveryId: string } | undefined,
  },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/hooks/use-alerts', () => ({
  useRetryAlertDelivery: () => retryState,
}))

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}))

function createDelivery(overrides: Partial<AlertDeliveryRecord> = {}): AlertDeliveryRecord {
  return {
    id: 'delivery-1',
    channelType: 'linear',
    status: 'failed',
    target: 'org-default:INTAKE',
    attemptCount: 2,
    externalIdentifier: null,
    externalUrl: null,
    lastError: 'Linear team is required before alert delivery can create issues.',
    providerMetadata: {},
    ...overrides,
  }
}

function createEvent(overrides: Partial<AlertEventRecord> = {}): AlertEventRecord {
  return {
    id: 'event-1',
    alertRuleId: 'rule-1',
    organizationId: 'org-1',
    connectionId: 'conn-1',
    queueName: 'email-send',
    type: 'job_failed',
    status: 'firing',
    summary: 'Linear delivery failed',
    context: { jobId: 'job-1', failedReason: 'boom' },
    firedAt: '2026-03-24T10:00:00.000Z',
    resolvedAt: null,
    notificationSentAt: null,
    deliveries: [createDelivery()],
    ...overrides,
  }
}

function renderDialog(event: AlertEventRecord) {
  return render(<AlertEventDetailsDialog event={event} open onOpenChange={() => {}} />)
}

describe('AlertEventDetailsDialog', () => {
  beforeEach(() => {
    retryState.mutateAsync = mutateAsync
    retryState.isPending = false
    retryState.variables = undefined
    mutateAsync.mockClear()
    toastSuccess.mockClear()
    toastError.mockClear()
  })

  it('renders delivery status, attempt count, humanized context, and the error log', () => {
    renderDialog(createEvent())

    expect(screen.getByText('Linear')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
    expect(screen.getByText('2 attempts')).toBeInTheDocument()
    expect(screen.getByText('Job Id')).toBeInTheDocument()
    expect(screen.getByText('Failed Reason')).toBeInTheDocument()
    expect(
      screen.getByText('Linear team is required before alert delivery can create issues.')
    ).toBeInTheDocument()
  })

  it('retries a failed delivery and surfaces a success toast', async () => {
    const user = userEvent.setup()
    renderDialog(createEvent())

    await user.click(screen.getByRole('button', { name: /retry/i }))

    expect(mutateAsync).toHaveBeenCalledWith({
      connectionId: 'conn-1',
      eventId: 'event-1',
      deliveryId: 'delivery-1',
    })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('does not offer retry for delivered channels', () => {
    renderDialog(
      createEvent({
        deliveries: [
          createDelivery({
            status: 'delivered',
            externalIdentifier: 'INT-12',
            externalUrl: 'https://linear.app/x/issue/INT-12',
            lastError: null,
          }),
        ],
      })
    )

    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /INT-12/ })).toHaveAttribute(
      'href',
      'https://linear.app/x/issue/INT-12'
    )
  })

  it('explains when no channels were configured', () => {
    renderDialog(createEvent({ deliveries: [] }))

    expect(screen.getByText(/No notification channels were configured/i)).toBeInTheDocument()
  })
})
