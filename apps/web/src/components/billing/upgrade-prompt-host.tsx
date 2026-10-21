import {
  type BillingErrorBody,
  FEATURE_LABELS,
  LIMIT_LABELS,
  PLANS,
} from '@durabull/api-client/billing'
import { Sparkles } from 'lucide-react'
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
import { reportUpgradePromptShown, useBilling } from '@/hooks/use-billing'
import { BILLING_DENIED_EVENT } from '@/lib/api'

/**
 * Explains a server-side billing denial once, wherever it happened: on a
 * deliberate paid-feature action or a genuine capacity boundary, never on a
 * normal read. Owners get the billing page; other members are told to ask
 * the owner, since they cannot authorize a purchase.
 */
export function UpgradePromptHost({ orgSlug }: { orgSlug: string }) {
  const [denial, setDenial] = useState<BillingErrorBody | null>(null)
  const { data: billing } = useBilling({ enabled: denial !== null })

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

  const canManage = billing?.enabled ? billing.canManageBilling : false
  const title =
    denial.code === 'feature_not_entitled'
      ? `${FEATURE_LABELS[denial.feature].name} needs ${PLANS[denial.requiredPlan].name}`
      : denial.code === 'plan_limit_reached'
        ? `${LIMIT_LABELS[denial.limit].name}: plan limit reached`
        : 'Billing status is being verified'
  const description =
    denial.code === 'feature_not_entitled' ? FEATURE_LABELS[denial.feature].outcome : denial.message

  return (
    <Dialog open onOpenChange={(open) => !open && setDenial(null)}>
      <DialogContent data-testid="upgrade-prompt">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {denial.code !== 'billing_state_unverified' ? (
          <p className="text-sm text-muted-foreground">
            {canManage
              ? `Upgrade to ${PLANS[denial.requiredPlan].name} to continue. Your work so far is kept.`
              : 'Ask your organization owner to upgrade. Your work so far is kept.'}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setDenial(null)}>
            Not now
          </Button>
          {canManage && denial.code !== 'billing_state_unverified' ? (
            <Button asChild onClick={() => setDenial(null)}>
              {/* A new tab keeps any draft form on this page intact. */}
              <a
                href={`/${encodeURIComponent(orgSlug)}/settings/billing`}
                target="_blank"
                rel="noreferrer"
              >
                View plans
              </a>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
