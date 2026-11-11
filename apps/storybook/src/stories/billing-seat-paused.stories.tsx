import type { Meta, StoryObj } from '@storybook/react-vite'
import { SeatPaused } from '@/components/billing/seat-paused'

const meta = {
  title: 'Web Components/Billing/Seat Paused',
  component: SeatPaused,
  args: {
    organizationName: 'Acme',
    otherOrganizations: [{ id: 'globex', name: 'Globex', slug: 'globex' }],
  },
} satisfies Meta<typeof SeatPaused>
export default meta
type Story = StoryObj<typeof meta>
export const WithOtherOrganizations: Story = {}
export const OnlyOrganization: Story = { args: { otherOrganizations: [] } }
