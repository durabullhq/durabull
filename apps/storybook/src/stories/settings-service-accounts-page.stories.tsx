import type { Meta, StoryObj } from '@storybook/react-vite'
import { ServiceAccountsPage } from '@/components/settings/service-accounts-page'

const meta = {
  title: 'Web Components/Settings/Service Accounts Page',
  component: ServiceAccountsPage,
  args: {},
} satisfies Meta<typeof ServiceAccountsPage>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
