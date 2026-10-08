import type { Meta, StoryObj } from '@storybook/react-vite'
import { NavUser } from '@/components/nav-user'

const meta = {
  title: 'Web Components/Nav User',
  component: NavUser,
  args: {
    user: { name: 'Alex Morgan', email: 'alex@example.com', avatar: '' },
    settingsPath: '/acme/settings',
  },
} satisfies Meta<typeof NavUser>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
