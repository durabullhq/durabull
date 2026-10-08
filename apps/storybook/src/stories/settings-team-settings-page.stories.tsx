import type { Meta, StoryObj } from '@storybook/react-vite'
import { TeamSettingsPage } from '@/components/settings/team-settings-page'

const meta = {
  title: 'Web Components/Settings/Team Settings Page',
  component: TeamSettingsPage,
  args: {},
} satisfies Meta<typeof TeamSettingsPage>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
