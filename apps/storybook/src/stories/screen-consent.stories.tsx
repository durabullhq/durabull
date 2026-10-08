import type { Meta, StoryObj } from '@storybook/react-vite'
import { ScreenPreview } from '../screen-preview'

const meta = {
  title: 'Web Screens/Account/Consent',
  component: ScreenPreview,
  args: { path: '/consent?consent_code=demo-consent&client_id=demo-assistant' },
  parameters: { layout: 'fullscreen', signedIn: true },
  tags: ['!autodocs'],
} satisfies Meta<typeof ScreenPreview>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
