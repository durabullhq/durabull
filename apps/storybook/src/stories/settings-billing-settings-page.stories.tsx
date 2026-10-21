import type { Meta, StoryObj } from '@storybook/react-vite'
import { BillingSettingsPage } from '@/components/settings/billing-settings-page'

const meta = {
  title: 'Web Components/Settings/Billing Settings Page',
  component: BillingSettingsPage,
  args: {},
} satisfies Meta<typeof BillingSettingsPage>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
