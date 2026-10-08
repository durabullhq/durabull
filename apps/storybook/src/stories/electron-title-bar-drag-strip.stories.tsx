import type { Meta, StoryObj } from '@storybook/react-vite'
import { ElectronTitleBarDragStrip } from '@/components/electron-title-bar-drag-strip'

const meta = {
  title: 'Desktop/Electron Title Bar Drag Strip',
  parameters: { desktop: true },
  component: ElectronTitleBarDragStrip,
  args: {},
} satisfies Meta<typeof ElectronTitleBarDragStrip>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
