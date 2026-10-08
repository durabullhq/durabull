import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { QueueMultiSelect } from '@/components/alerts/queue-multi-select'

const meta = {
  title: 'Web Components/Alerts/Queue Multi Select',
  component: QueueMultiSelect,
  args: {
    availableQueues: ['email:receipts', 'image:resize'],
    selectedQueueNames: ['email:receipts'],
    onSelectedQueueNamesChange: fn(),
    queueFilterMode: 'include',
    onQueueFilterModeChange: fn(),
  },
} satisfies Meta<typeof QueueMultiSelect>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
