import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ConfirmDialog } from '@/components/confirm-dialog'

const meta = {
  title: 'Web Components/Confirm Dialog',
  component: ConfirmDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    title: 'Remove this job?',
    description: 'This action is simulated in the catalog.',
    onConfirm: fn(),
    destructive: true,
  },
} satisfies Meta<typeof ConfirmDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Pending: Story = { args: { isConfirming: true } }
