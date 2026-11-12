import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { SlackDestinationFields } from '@/components/settings/slack-destination-fields'
import type { SlackDestinationConfig } from '@/hooks/use-alerts'

function SlackDestinationFieldsPreview({ compact = false }: { compact?: boolean }) {
  const [config, setConfig] = useState<Partial<SlackDestinationConfig>>({
    channelId: 'C0ALERTS',
    channelName: 'alerts',
    mention: 'here',
    userGroupIds: ['S0ONCALL'],
    threadUpdates: true,
  })
  return (
    <div className="max-w-lg">
      <SlackDestinationFields config={config} onChange={setConfig} compact={compact} />
    </div>
  )
}

const meta = {
  title: 'Web Components/Settings/Slack Destination Fields',
  component: SlackDestinationFieldsPreview,
} satisfies Meta<typeof SlackDestinationFieldsPreview>
export default meta
type Story = StoryObj<typeof meta>
export const Full: Story = {}
export const ChannelOnly: Story = { args: { compact: true } }
