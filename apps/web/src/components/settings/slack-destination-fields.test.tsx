import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SlackDestinationFields } from '@/components/settings/slack-destination-fields'

const mocks = vi.hoisted(() => ({
  channels: vi.fn(),
  refresh: vi.fn(),
  groupsFailed: false,
  refetchGroups: vi.fn(),
}))

vi.mock('@/hooks/use-slack', () => ({
  useSlackChannels: () => ({
    data: mocks.channels(),
    isLoading: false,
    isError: false,
    refresh: mocks.refresh,
  }),
  useSlackUserGroups: () =>
    mocks.groupsFailed
      ? { data: undefined, isLoading: false, isError: true, refetch: mocks.refetchGroups }
      : {
          data: { userGroups: [{ id: 'S0ONCALL', handle: 'oncall', name: 'On-call' }] },
          isLoading: false,
          isError: false,
          refetch: mocks.refetchGroups,
        },
}))

const ALERTS = { id: 'C0ALERTS', name: 'alerts', isPrivate: false, isMember: true }

describe('SlackDestinationFields', () => {
  beforeEach(() => {
    mocks.channels.mockReturnValue({ channels: [ALERTS], truncated: false })
    mocks.refresh.mockReset()
    mocks.groupsFailed = false
  })

  it('says why the channel list did not reload', async () => {
    mocks.refresh.mockRejectedValue(new Error('Slack rate limit reached.'))
    render(<SlackDestinationFields config={{}} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reload Slack channels' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reload channels: Slack rate limit reached.'
    )
  })

  it('reports a failed user group request instead of an empty workspace', async () => {
    mocks.groupsFailed = true
    render(<SlackDestinationFields config={{ channelId: 'C0ALERTS' }} onChange={vi.fn()} />)
    expect(screen.getByRole('option', { name: 'User groups unavailable' })).toBeInTheDocument()
    expect(screen.queryByText('No user groups in this workspace')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(mocks.refetchGroups).toHaveBeenCalled()
  })

  it('offers channel ID entry only when the channel list is truncated', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<SlackDestinationFields config={{}} onChange={onChange} />)
    expect(screen.queryByLabelText('Slack channel ID')).toBeNull()

    mocks.channels.mockReturnValue({ channels: [ALERTS], truncated: true })
    rerender(<SlackDestinationFields config={{}} onChange={onChange} />)
    const input = screen.getByLabelText('Slack channel ID')
    const use = screen.getByRole('button', { name: 'Use channel' })
    await userEvent.type(input, 'not a channel')
    expect(use).toBeDisabled()

    await userEvent.clear(input)
    await userEvent.type(input, ' c0incidents ')
    await userEvent.click(use)
    expect(onChange).toHaveBeenCalledWith({ channelId: 'C0INCIDENTS', channelName: undefined })
  })

  it('keeps a saved channel that is not in the listed page selected', () => {
    mocks.channels.mockReturnValue({ channels: [ALERTS], truncated: true })
    render(
      <SlackDestinationFields
        config={{ channelId: 'C0INCIDENTS', channelName: 'incidents' }}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Channel')).toHaveValue('C0INCIDENTS')
    expect(screen.getByRole('option', { name: '# incidents' })).toBeInTheDocument()
  })

  it('lists only user groups that are not already mentioned', () => {
    render(
      <SlackDestinationFields
        config={{ channelId: 'C0ALERTS', userGroupIds: ['S0ONCALL'] }}
        onChange={vi.fn()}
      />
    )
    expect(screen.queryByRole('option', { name: '@oncall (On-call)' })).toBeNull()
    expect(screen.getByText('@oncall')).toBeInTheDocument()
  })
})
