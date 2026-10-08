import type { Meta, StoryObj } from '@storybook/react-vite'
import { AlertDestinationsPage } from '@/components/settings/alert-destinations-page'

const meta = {
  title: 'Web Components/Settings/Alert Destinations Page',
  component: AlertDestinationsPage,
  args: {},
} satisfies Meta<typeof AlertDestinationsPage>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
