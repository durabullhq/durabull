import type { Meta, StoryObj } from '@storybook/react-vite'
import { MacDesktopSidebarControls } from '@/components/mac-desktop-sidebar-controls'

const meta = {
  title: 'Desktop/Mac Desktop Sidebar Controls',
  parameters: { desktop: true },
  component: MacDesktopSidebarControls,
  args: {},
} satisfies Meta<typeof MacDesktopSidebarControls>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
