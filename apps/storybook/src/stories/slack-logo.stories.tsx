import type { Meta, StoryObj } from '@storybook/react-vite'
import { SlackLogo } from '@/components/brand/slack-logo'

const meta = {
  title: 'Web Components/Brand/Slack Logo',
  component: SlackLogo,
  args: { className: 'h-8 w-8' },
} satisfies Meta<typeof SlackLogo>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Muted: Story = { args: { className: 'h-6 w-6 text-muted-foreground' } }
