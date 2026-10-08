import type { Meta, StoryObj } from '@storybook/react-vite'
import { ThemeToggle } from '@/components/theme-toggle'

const meta = {
  title: 'Web Components/Theme Toggle',
  component: ThemeToggle,
  args: {},
} satisfies Meta<typeof ThemeToggle>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
