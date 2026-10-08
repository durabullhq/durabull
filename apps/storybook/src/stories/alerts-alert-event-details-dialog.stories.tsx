import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { fn } from 'storybook/test'
import { AlertEventDetailsDialog } from '@/components/alerts/alert-event-details-dialog'
import { event } from '../fixtures/data'

const meta = {
  title: 'Web Components/Alerts/Alert Event Details Dialog',
  component: AlertEventDetailsDialog,
  args: {
    event: event as ComponentProps<typeof AlertEventDetailsDialog>['event'],
    open: true,
    onOpenChange: fn(),
  },
} satisfies Meta<typeof AlertEventDetailsDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
