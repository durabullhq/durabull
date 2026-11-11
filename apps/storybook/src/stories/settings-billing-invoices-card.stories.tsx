import type { Meta, StoryObj } from '@storybook/react-vite'
import { InvoicesCard } from '@/components/settings/billing/invoices-card'

const meta = {
  title: 'Web Components/Settings/Billing/Invoices',
  component: InvoicesCard,
  args: { onOpenPortal: () => {} },
} satisfies Meta<typeof InvoicesCard>
export default meta
type Story = StoryObj<typeof meta>
export const Recent: Story = {}
export const NoInvoices: Story = { parameters: { fixtureState: 'empty' } }
