import type { Meta, StoryObj } from '@storybook/react-vite'
import { ScreenPreview } from '../screen-preview'

const meta = {
  title: 'Web Screens/Connection/New Scheduler',
  component: ScreenPreview,
  args: { path: '/acme/c/demo-redis/queues/email%3Areceipts/scheduled-jobs/new' },
  parameters: { layout: 'fullscreen' },
  tags: ['!autodocs'],
} satisfies Meta<typeof ScreenPreview>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
