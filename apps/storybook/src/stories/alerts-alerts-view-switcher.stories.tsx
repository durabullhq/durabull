import type { Meta, StoryObj } from '@storybook/react-vite'
import { AlertsViewSwitcher } from '@/components/alerts/alerts-view-switcher'

const meta = {
  title: 'Web Components/Alerts/Alerts View Switcher',
  component: AlertsViewSwitcher,
  args: { orgSlug: 'acme', connectionId: 'demo-redis' },
} satisfies Meta<typeof AlertsViewSwitcher>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
