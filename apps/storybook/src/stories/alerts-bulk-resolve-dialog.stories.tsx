import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { BulkResolveDialog } from '@/components/alerts/bulk-resolve-dialog'

const meta = {
  title: 'Web Components/Alerts/Bulk Resolve Dialog',
  component: BulkResolveDialog,
  args: { connectionId: 'demo-redis', open: true, onOpenChange: fn() },
} satisfies Meta<typeof BulkResolveDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
