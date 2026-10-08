import type { Meta, StoryObj } from '@storybook/react-vite'
import { Database } from 'lucide-react'
import { NoConnectionConfigured } from '@/components/no-connection-configured'

const meta = {
  title: 'Web Components/No Connection Configured',
  component: NoConnectionConfigured,
  args: { orgSlug: 'acme', area: 'Queues', icon: Database },
} satisfies Meta<typeof NoConnectionConfigured>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
