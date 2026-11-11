import type { Meta, StoryObj } from '@storybook/react-vite'
import { AlertTriangle, CalendarClock, CheckCircle2, CreditCard } from 'lucide-react'
import { Notice } from '@/components/settings/billing/notice'
import { Button } from '@/components/ui/button'

/** Every tone a billing notice uses, with and without a next step. */
function NoticeGallery() {
  return (
    <div className="max-w-3xl space-y-3">
      <Notice
        tone="warning"
        icon={AlertTriangle}
        title="Payment failed"
        action={<Button size="sm">Update payment method</Button>}
      >
        Your Team access continues until Nov 16, 2026. Update your payment method to keep it.
      </Notice>
      <Notice tone="info" icon={CalendarClock} title="Your trial is ending">
        The Business trial ends on Nov 20, 2026.
      </Notice>
      <Notice tone="success" icon={CheckCircle2} title="Purchase complete">
        Thank you. Your Team plan is active.
      </Notice>
      <Notice tone="neutral" icon={CreditCard} title="Checkout canceled">
        Nothing was charged and your plan is unchanged.
      </Notice>
    </div>
  )
}

const meta = {
  title: 'Web Components/Settings/Billing/Notice',
  component: NoticeGallery,
} satisfies Meta<typeof NoticeGallery>
export default meta
type Story = StoryObj<typeof meta>
export const Tones: Story = {}
