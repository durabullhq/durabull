import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ConnectionIncidentsView } from '@/components/alerts/connection-incidents-view'

const meta = {
  title: 'Web Components/Alerts/Connection Incidents View',
  component: ConnectionIncidentsView,
  args: { orgSlug: 'acme', connectionId: 'demo-redis', status: 'open', onStatusChange: fn() },
} satisfies Meta<typeof ConnectionIncidentsView>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Empty: Story = { parameters: { fixtureState: 'empty' } }
export const Loading: Story = { parameters: { fixtureState: 'loading' } }
export const Unavailable: Story = { parameters: { fixtureState: 'error' } }
