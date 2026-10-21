import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { UpgradePromptHost } from '@/components/billing/upgrade-prompt-host'
import { BILLING_DENIED_EVENT } from '@/lib/api'

function UpgradePromptPreview({ orgSlug }: { orgSlug: string }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(BILLING_DENIED_EVENT, {
          detail: {
            code: 'plan_limit_reached',
            limit: 'connections.enabled',
            usage: 5,
            allowed: 5,
            requiredPlan: 'business',
            message:
              'Your plan includes 5 connections. Remove or disable one, or upgrade to Business for more.',
            billingUrl: '/settings/billing',
          },
        })
      )
    }, 0)
    return () => clearTimeout(timer)
  }, [])
  return <UpgradePromptHost orgSlug={orgSlug} />
}

const meta = {
  title: 'Web Components/Billing/Upgrade Prompt',
  component: UpgradePromptPreview,
  args: { orgSlug: 'acme' },
} satisfies Meta<typeof UpgradePromptPreview>
export default meta
type Story = StoryObj<typeof meta>
export const PlanLimitReached: Story = {}
