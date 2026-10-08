import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConnectionsSettingsPage } from '@/components/settings/connections-settings-page'

const meta = {
  title: 'Web Components/Settings/Connections Settings Page',
  component: ConnectionsSettingsPage,
  args: {},
} satisfies Meta<typeof ConnectionsSettingsPage>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Empty: Story = { parameters: { fixtureState: 'empty-connections' } }
export const Loading: Story = { parameters: { fixtureState: 'loading' } }
export const Unavailable: Story = { parameters: { fixtureState: 'error' } }
