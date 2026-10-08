import type { Meta, StoryObj } from '@storybook/react-vite'
import { ScreenPreview } from '../screen-preview'

const meta = {
  title: 'Web Screens/Account/Auth Error',
  component: ScreenPreview,
  args: { path: '/auth-error' },
  parameters: { layout: 'fullscreen', signedIn: false },
  tags: ['!autodocs'],
} satisfies Meta<typeof ScreenPreview>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
