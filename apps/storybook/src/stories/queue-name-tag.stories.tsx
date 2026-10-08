import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueueNameTag } from '@/components/queue-name-tag'

const meta = {
  title: 'Web Components/Queue Name Tag',
  component: QueueNameTag,
  args: { name: 'email:receipts', asLink: true },
} satisfies Meta<typeof QueueNameTag>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
