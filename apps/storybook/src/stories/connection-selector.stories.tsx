import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConnectionSelector } from '@/components/connection-selector'

const meta = {
  title: 'Web Components/Connection Selector',
  component: ConnectionSelector,
  args: {},
} satisfies Meta<typeof ConnectionSelector>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
