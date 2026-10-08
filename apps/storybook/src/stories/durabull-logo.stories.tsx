import type { Meta, StoryObj } from '@storybook/react-vite'
import { DurabullLogo } from '@/components/durabull-logo'

const meta = {
  title: 'Web Components/Durabull Logo',
  component: DurabullLogo,
  args: { className: 'size-20' },
} satisfies Meta<typeof DurabullLogo>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
