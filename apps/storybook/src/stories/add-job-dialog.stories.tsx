import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AddJobDialog } from '@/components/add-job-dialog'

const meta = {
  title: 'Web Components/Add Job Dialog',
  component: AddJobDialog,
  args: { open: true, onOpenChange: fn(), queueName: 'email:receipts' },
} satisfies Meta<typeof AddJobDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
