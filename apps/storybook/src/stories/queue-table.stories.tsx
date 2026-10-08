import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { fn } from 'storybook/test'
import { QueueTable } from '@/components/queue-table'
import { queues } from '../fixtures/data'

const meta = {
  title: 'Web Components/Queue Table',
  component: QueueTable,
  args: {
    queues: queues as ComponentProps<typeof QueueTable>['queues'],
    total: 3,
    totalPages: 1,
    onSearchChange: fn(),
    onSortChange: fn(),
    onStatusFilterChange: fn(),
  },
} satisfies Meta<typeof QueueTable>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Empty: Story = { args: { queues: [] } }
export const Loading: Story = { args: { isPlaceholderData: true } }
