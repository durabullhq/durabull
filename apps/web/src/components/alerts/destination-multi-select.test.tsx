import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DestinationMultiSelect } from '@/components/alerts/destination-multi-select'
import type { AlertRuleDestinationSummary } from '@/hooks/use-alerts'

function buildDestinations(): AlertRuleDestinationSummary[] {
  return [
    { id: 'dest-1', name: 'On-call pipeline', type: 'webhook', enabled: true },
    { id: 'dest-2', name: 'Ops inbox', type: 'email', enabled: true },
    { id: 'dest-3', name: 'Linear triage', type: 'linear', enabled: true },
    { id: 'dest-4', name: 'Old endpoint', type: 'webhook', enabled: false },
  ]
}

describe('DestinationMultiSelect', () => {
  it('groups destinations by type and toggles selection', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DestinationMultiSelect
        destinations={buildDestinations()}
        selectedDestinationIds={[]}
        onSelectedDestinationIdsChange={onChange}
      />
    )

    await user.click(screen.getByTestId('destination-multi-select-trigger'))

    expect(screen.getByText('Webhooks')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Linear')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ops inbox' }))

    expect(onChange).toHaveBeenCalledWith(['dest-2'])
  })

  it('deselects an already-selected destination and removes via its chip', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DestinationMultiSelect
        destinations={buildDestinations()}
        selectedDestinationIds={['dest-1', 'dest-2']}
        onSelectedDestinationIdsChange={onChange}
      />
    )

    await user.click(screen.getByTestId('destination-multi-select-trigger'))
    await user.click(screen.getByRole('button', { name: 'On-call pipeline' }))
    expect(onChange).toHaveBeenCalledWith(['dest-2'])

    await user.click(screen.getByRole('button', { name: 'Remove Ops inbox' }))
    expect(onChange).toHaveBeenCalledWith(['dest-1'])
  })

  it('shows disabled destinations with a hint and does not select them', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DestinationMultiSelect
        destinations={buildDestinations()}
        selectedDestinationIds={[]}
        onSelectedDestinationIdsChange={onChange}
      />
    )

    await user.click(screen.getByTestId('destination-multi-select-trigger'))

    const disabledOption = screen.getByRole('button', { name: 'Old endpoint (disabled)' })
    expect(disabledOption).toHaveAttribute('aria-disabled', 'true')

    await user.click(disabledOption)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('offers a search input only when more than eight destinations exist', async () => {
    const user = userEvent.setup()
    const few = buildDestinations()

    const { unmount } = render(
      <DestinationMultiSelect
        destinations={few}
        selectedDestinationIds={[]}
        onSelectedDestinationIdsChange={vi.fn()}
      />
    )
    await user.click(screen.getByTestId('destination-multi-select-trigger'))
    expect(screen.queryByPlaceholderText('Search destinations')).not.toBeInTheDocument()
    unmount()

    const many: AlertRuleDestinationSummary[] = Array.from({ length: 9 }, (_, index) => ({
      id: `dest-${index}`,
      name: `Destination ${index}`,
      type: 'webhook',
      enabled: true,
    }))

    render(
      <DestinationMultiSelect
        destinations={many}
        selectedDestinationIds={[]}
        onSelectedDestinationIdsChange={vi.fn()}
      />
    )
    await user.click(screen.getByTestId('destination-multi-select-trigger'))

    const searchInput = screen.getByPlaceholderText('Search destinations')
    await user.type(searchInput, 'Destination 7')

    expect(screen.getByRole('button', { name: 'Destination 7' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Destination 3' })).not.toBeInTheDocument()
  })

  it('invites creating destinations when none exist', async () => {
    const user = userEvent.setup()

    render(
      <DestinationMultiSelect
        destinations={[]}
        selectedDestinationIds={[]}
        onSelectedDestinationIdsChange={vi.fn()}
      />
    )

    await user.click(screen.getByTestId('destination-multi-select-trigger'))

    expect(screen.getByText(/No saved destinations yet/)).toBeInTheDocument()
  })
})
