import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SlackDestinationFields } from '@/components/settings/slack-destination-fields'

const mocks = vi.hoisted(() => ({ channels: vi.fn() }))

vi.mock('@/hooks/use-slack', () => ({
  useSlackChannels: () => ({
    data: mocks.channels(),
    isLoading: false,
    isError: false,
    refresh: vi.fn(),
  }),
  useSlackUserGroups: () => ({
    data: { userGroups: [{ id: 'S0ONCALL', handle: 'oncall', name: 'On-call' }] },
    isLoading: false,
  }),
}))

const ALERTS = { id: 'C0ALERTS', name: 'alerts', isPrivate: false, isMember: true }

describe('SlackDestinationFields', () => {
  beforeEach(() => {
    mocks.channels.mockReturnValue({ channels: [ALERTS], truncated: false })
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
