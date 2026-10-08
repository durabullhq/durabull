import type { Meta, StoryObj } from '@storybook/react-vite'
import { AuthenticationSettingsPanel } from '@/components/settings/authentication-settings-panel'

const meta = {
  title: 'Web Components/Settings/Authentication Settings Panel',
  component: AuthenticationSettingsPanel,
  args: {},
} satisfies Meta<typeof AuthenticationSettingsPanel>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
