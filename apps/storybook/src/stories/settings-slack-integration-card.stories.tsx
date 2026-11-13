import type { Meta, StoryObj } from '@storybook/react-vite'
import { SlackIntegrationCard } from '@/components/settings/slack-integration-card'

const meta = {
  title: 'Web Components/Settings/Slack Integration Card',
  component: SlackIntegrationCard,
  args: { orgSlug: 'acme' },
  decorators: [
    (Story) => (
      <div className="max-w-4xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SlackIntegrationCard>
export default meta
type Story = StoryObj<typeof meta>

/** Connected workspace with one Slack destination and the setup checklist. */
export const Connected: Story = { parameters: { slackFixture: 'connected' } }
/** Team plan and up, not yet connected. */
export const NotConnected: Story = { parameters: { slackFixture: 'disconnected' } }
/** Free plan: shows what the Slack app does and nudges an upgrade. */
export const UpgradeNudge: Story = { parameters: { slackFixture: 'locked' } }
/** Self-hosted server without Slack app credentials. */
export const NotConfigured: Story = { parameters: { slackFixture: 'unconfigured' } }
/** Slack revoked the token (app removed from the workspace). */
export const ReconnectNeeded: Story = { parameters: { slackFixture: 'revoked' } }
