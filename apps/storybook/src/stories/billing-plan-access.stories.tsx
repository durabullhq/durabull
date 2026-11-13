import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  CapacityCount,
  FeatureUpgradeNote,
  LimitReachedNote,
  PausedBadge,
  PlanBadge,
  UpgradeNextStep,
} from '@/components/billing/plan-access'

/** The plan-gating pieces controls use before the user acts, on Free at its limits. */
function PlanAccessGallery() {
  return (
    <div className="max-w-xl space-y-4 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <PlanBadge plan="team" />
        <PlanBadge plan="business" />
        <PausedBadge />
        <CapacityCount limit="connections.enabled" />
      </div>
      <FeatureUpgradeNote feature="alerts.webhook" />
      <LimitReachedNote limit="connections.enabled" />
      <LimitReachedNote limit="service_accounts.enabled" />
      <p className="text-muted-foreground">
        Next step: <UpgradeNextStep plan="team" />
      </p>
    </div>
  )
}

const meta = {
  title: 'Web Components/Billing/Plan Access',
  component: PlanAccessGallery,
  parameters: { billingScenario: 'free-at-limit' },
} satisfies Meta<typeof PlanAccessGallery>
export default meta
type Story = StoryObj<typeof meta>
export const FreeAtLimit: Story = {}
