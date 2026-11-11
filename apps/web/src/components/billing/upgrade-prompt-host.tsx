import {
  type BillingErrorBody,
  FEATURE_LABELS,
  LIMIT_LABELS,
  PLANS,
  type PlanCode,
} from '@durabull/api-client/billing'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { reportUpgradePromptShown } from '@/hooks/use-billing'
import { useEntitlement } from '@/hooks/use-entitlement'
import { BILLING_DENIED_EVENT } from '@/lib/api'
import { SALES_EMAIL } from '@/lib/billing'

function describe(denial: BillingErrorBody): {
  title: string
  description: string
  requiredPlan: PlanCode | null
} {
  switch (denial.code) {
    case 'feature_not_entitled':
      return {
        title: `${FEATURE_LABELS[denial.feature].name} needs ${PLANS[denial.requiredPlan].name}`,
        description: FEATURE_LABELS[denial.feature].outcome,
        requiredPlan: denial.requiredPlan,
      }
    case 'plan_limit_reached':
      return {
        title: `${LIMIT_LABELS[denial.limit].name}: plan limit reached`,
        description: denial.message,
        requiredPlan: denial.requiredPlan,
      }
    case 'plan_limit_unspecified':
      return { title: 'Plan limit reached', description: denial.message, requiredPlan: null }
    case 'billing_state_unverified':
      return {
        title: 'Billing status is being verified',
        description: denial.message,
        requiredPlan: null,
      }
  }
}

/**
 * Explains a server-side billing denial once, wherever it happened: on a
 * deliberate paid-feature action or a genuine capacity boundary, never on a
 * normal read. Owners get the billing page; other members are told to ask
 * the owner, since they cannot authorize a purchase.
 */
export function UpgradePromptHost({ orgSlug }: { orgSlug: string }) {
  const [denial, setDenial] = useState<BillingErrorBody | null>(null)
  const { canManageBilling } = useEntitlement()

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<BillingErrorBody>).detail
      setDenial(detail)
      reportUpgradePromptShown({
        feature: detail.code === 'feature_not_entitled' ? detail.feature : undefined,
        limit: detail.code === 'plan_limit_reached' ? detail.limit : undefined,
      })
    }
    window.addEventListener(BILLING_DENIED_EVENT, listener)
    return () => window.removeEventListener(BILLING_DENIED_EVENT, listener)
  }, [])

  if (!denial) return null

  const { title, description, requiredPlan } = describe(denial)
  const unverified = denial.code === 'billing_state_unverified'
  // Limits above Business are arranged with us rather than bought self-serve.
  const contactSales = requiredPlan === 'enterprise'

  return (
    <Dialog open onOpenChange={(open) => !open && setDenial(null)}>
      <DialogContent data-testid="upgrade-prompt">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <p className="text-[13px] leading-5 text-muted-foreground">
          {unverified
            ? canManageBilling
              ? 'Open Billing and refresh the status. Nothing you have set up is affected.'
              : 'Your organization owner can refresh the status in Billing.'
            : canManageBilling
              ? denial.code === 'feature_not_entitled'
                ? `Included in ${PLANS[denial.requiredPlan].name} and above. Your work so far is kept.`
                : 'Your work so far is kept.'
              : 'Ask your organization owner to upgrade. Your work so far is kept.'}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setDenial(null)}>
            Not now
          </Button>
          {canManageBilling ? (
            contactSales ? (
              <Button asChild onClick={() => setDenial(null)}>
                <a href={`mailto:${SALES_EMAIL}?subject=Durabull%20Enterprise`}>Contact us</a>
              </Button>
            ) : (
              <Button asChild onClick={() => setDenial(null)}>
                {/* A new tab keeps any draft form on this page intact. */}
                <a
                  href={`/${encodeURIComponent(orgSlug)}/settings/billing`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {unverified ? 'Open Billing' : 'View plans'}
                </a>
              </Button>
            )
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
