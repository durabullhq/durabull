import type { Meta, StoryObj } from '@storybook/react-vite'
import { IntegrationsSettingsPanel } from '@/components/settings/integrations-settings-panel'

const meta = {
  title: 'Web Components/Settings/Integrations Settings Panel',
  component: IntegrationsSettingsPanel,
  args: { orgSlug: 'acme' },
} satisfies Meta<typeof IntegrationsSettingsPanel>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const SlackUpgradeNudge: Story = { parameters: { slackFixture: 'locked' } }
export const SlackNotConnected: Story = { parameters: { slackFixture: 'disconnected' } }
