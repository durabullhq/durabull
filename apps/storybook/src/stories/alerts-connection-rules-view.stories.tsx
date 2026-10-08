import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConnectionRulesView } from '@/components/alerts/connection-rules-view'

const meta = {
  title: 'Web Components/Alerts/Connection Rules View',
  component: ConnectionRulesView,
  args: { orgSlug: 'acme', connectionId: 'demo-redis' },
} satisfies Meta<typeof ConnectionRulesView>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Empty: Story = { parameters: { fixtureState: 'empty' } }
export const Loading: Story = { parameters: { fixtureState: 'loading' } }
export const Unavailable: Story = { parameters: { fixtureState: 'error' } }
