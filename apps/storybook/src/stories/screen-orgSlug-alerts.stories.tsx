import type { Meta, StoryObj } from '@storybook/react-vite'
import { ScreenPreview } from '../screen-preview'

const meta = {
  title: 'Web Screens/Organization/Alerts',
  component: ScreenPreview,
  args: { path: '/acme/alerts' },
  parameters: { layout: 'fullscreen' },
  tags: ['!autodocs'],
} satisfies Meta<typeof ScreenPreview>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
