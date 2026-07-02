import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertDestinationsPage } from '@/components/settings/alert-destinations-page'
import type { AlertDestinationRecord } from '@/hooks/use-alerts'

const {
  toastSuccessMock,
  toastErrorMock,
  useAlertDestinationsMock,
  createMutateAsyncMock,
  updateMutateAsyncMock,
  deleteMutateAsyncMock,
  testMutateAsyncMock,
  refetchMock,
} = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  useAlertDestinationsMock: vi.fn(),
  createMutateAsyncMock: vi.fn(),
  updateMutateAsyncMock: vi.fn(),
  deleteMutateAsyncMock: vi.fn(),
  testMutateAsyncMock: vi.fn(),
  refetchMock: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock('@/hooks/use-alerts', () => ({
  useAlertDestinations: useAlertDestinationsMock,
  useCreateAlertDestination: () => ({ mutateAsync: createMutateAsyncMock, isPending: false }),
  useUpdateAlertDestination: () => ({ mutateAsync: updateMutateAsyncMock, isPending: false }),
  useDeleteAlertDestination: () => ({ mutateAsync: deleteMutateAsyncMock, isPending: false }),
  useTestAlertDestination: () => ({ mutateAsync: testMutateAsyncMock, isPending: false }),
  useLinearIntegration: () => ({
    data: { integration: { validationStatus: 'valid' } },
  }),
  useLinearMetadata: () => ({ data: undefined, isLoading: false }),
}))

function buildDestination(overrides: Partial<AlertDestinationRecord> = {}): AlertDestinationRecord {
  return {
    id: 'dest-1',
    organizationId: 'org-1',
    name: 'On-call pipeline',
    type: 'webhook',
    url: 'https://example.com/hook',
    config: {},
    enabled: true,
    secretConfigured: true,
    secretLast4: '4242',
    inUseByRuleCount: 0,
    ...overrides,
  }
}

describe('AlertDestinationsPage', () => {
  beforeEach(() => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    createMutateAsyncMock.mockReset().mockResolvedValue({ destination: buildDestination() })
    updateMutateAsyncMock.mockReset().mockResolvedValue({ destination: buildDestination() })
    deleteMutateAsyncMock.mockReset().mockResolvedValue({ ok: true })
    testMutateAsyncMock
      .mockReset()
      .mockResolvedValue({ success: true, httpStatus: 200, durationMs: 87 })
    refetchMock.mockReset()

    useAlertDestinationsMock.mockReturnValue({
      data: { destinations: [buildDestination()] },
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    })
  })

  it('lists destinations with type, target, secret hint, and usage', () => {
    useAlertDestinationsMock.mockReturnValue({
      data: {
        destinations: [
          buildDestination({ inUseByRuleCount: 3 }),
          buildDestination({
            id: 'dest-2',
            name: 'Ops inbox',
            type: 'email',
            url: null,
            config: { target: 'ops@example.com' },
            secretConfigured: false,
            secretLast4: undefined,
          }),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    })

    render(<AlertDestinationsPage />)

    expect(screen.getByText('On-call pipeline')).toBeInTheDocument()
    expect(screen.getByText(/https:\/\/example\.com\/hook/)).toBeInTheDocument()
    expect(screen.getByText(/secret …4242/)).toBeInTheDocument()
    expect(screen.getByText('In use by 3 rules')).toBeInTheDocument()
    expect(screen.getByText('Ops inbox')).toBeInTheDocument()
    expect(screen.getByText('ops@example.com')).toBeInTheDocument()
  })

  it('creates a webhook destination through the type-choice dialog', async () => {
    const user = userEvent.setup()

    render(<AlertDestinationsPage />)

    await user.click(screen.getByRole('button', { name: /Add destination/ }))
    await user.click(await screen.findByTestId('destination-type-webhook'))

    await user.type(screen.getByLabelText('Name'), 'New hook')
    await user.type(screen.getByLabelText('URL'), 'https://example.com/new')
    await user.type(screen.getByLabelText('Signing secret'), 'super-secret-value-123')
    await user.click(screen.getByRole('button', { name: 'Create destination' }))

    await waitFor(() =>
      expect(createMutateAsyncMock).toHaveBeenCalledWith({
        type: 'webhook',
        name: 'New hook',
        url: 'https://example.com/new',
        signingSecret: 'super-secret-value-123',
      })
    )
    expect(toastSuccessMock).toHaveBeenCalledWith('Destination created', {
      description: 'New hook',
    })
  })

  it('creates an email destination with a config target', async () => {
    const user = userEvent.setup()

    render(<AlertDestinationsPage />)

    await user.click(screen.getByRole('button', { name: /Add destination/ }))
    await user.click(await screen.findByTestId('destination-type-email'))

    await user.type(screen.getByLabelText('Name'), 'Ops inbox')
    await user.type(screen.getByLabelText('Recipient email'), 'oncall@example.com')
    await user.click(screen.getByRole('button', { name: 'Create destination' }))

    await waitFor(() =>
      expect(createMutateAsyncMock).toHaveBeenCalledWith({
        type: 'email',
        name: 'Ops inbox',
        config: { target: 'oncall@example.com' },
      })
    )
  })

  it('edits a destination and saves the patch payload', async () => {
    const user = userEvent.setup()

    render(<AlertDestinationsPage />)

    await user.click(screen.getByRole('button', { name: 'Edit' }))

    const nameInput = await screen.findByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Renamed hook')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(updateMutateAsyncMock).toHaveBeenCalledWith({
        destinationId: 'dest-1',
        input: {
          name: 'Renamed hook',
          enabled: true,
          url: 'https://example.com/hook',
        },
      })
    )
  })

  it('tests a webhook destination and reports http status and duration', async () => {
    const user = userEvent.setup()

    render(<AlertDestinationsPage />)

    await user.click(screen.getByRole('button', { name: 'Test' }))

    await waitFor(() => expect(testMutateAsyncMock).toHaveBeenCalledWith('dest-1'))
    expect(toastSuccessMock).toHaveBeenCalledWith('Test delivered to On-call pipeline', {
      description: 'HTTP 200 in 87ms',
    })
  })

  it('deletes an unused destination after confirmation', async () => {
    const user = userEvent.setup()

    render(<AlertDestinationsPage />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // The row button and the dialog confirm share the label; the portal-mounted
    // dialog confirm is appended last in the DOM.
    const deleteButtons = await screen.findAllByRole('button', { name: 'Delete' })
    await user.click(deleteButtons[deleteButtons.length - 1])

    await waitFor(() => expect(deleteMutateAsyncMock).toHaveBeenCalledWith('dest-1'))
    expect(toastSuccessMock).toHaveBeenCalledWith('Destination deleted', {
      description: 'On-call pipeline was removed.',
    })
  })

  it('disables delete for in-use destinations', () => {
    useAlertDestinationsMock.mockReturnValue({
      data: { destinations: [buildDestination({ inUseByRuleCount: 2 })] },
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    })

    render(<AlertDestinationsPage />)

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('shows the empty state and the error state with retry', async () => {
    const user = userEvent.setup()
    useAlertDestinationsMock.mockReturnValue({
      data: { destinations: [] },
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    })

    const { unmount } = render(<AlertDestinationsPage />)
    expect(screen.getByText('No destinations yet')).toBeInTheDocument()
    unmount()

    useAlertDestinationsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchMock,
    })

    render(<AlertDestinationsPage />)
    expect(screen.getByText('Failed to load alert destinations.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetchMock).toHaveBeenCalled()
  })
})
