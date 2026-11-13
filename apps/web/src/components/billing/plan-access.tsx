import {
  type CapacityLimitKey,
  FEATURE_LABELS,
  type FeatureKey,
  formatLimitQuantity,
  LIMIT_LABELS,
  PLANS,
  type PlanCode,
} from '@durabull/api-client/billing'
import { Link, useParams } from '@tanstack/react-router'
import { Lock, PauseCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { useEntitlement } from '@/hooks/use-entitlement'
import { cn } from '@/lib/utils'

/** Link to the active organization's billing page, or null outside an organization route. */
export function BillingLink({ children, className }: { children: ReactNode; className?: string }) {
  const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string }
  if (!orgSlug) return null
  return (
    <Link
      to="/$orgSlug/settings/billing"
      params={{ orgSlug }}
      className={cn(
        'font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground',
        className
      )}
    >
      {children}
    </Link>
  )
}

/** Marks a control whose feature needs a higher plan, so the cost is visible before clicking. */
export function PlanBadge({ plan, className }: { plan: PlanCode; className?: string }) {
  return (
    <Badge variant="neutral" className={cn('shrink-0', className)} data-testid="plan-badge">
      {PLANS[plan].name}
    </Badge>
  )
}

/** Plan badge for a feature the organization does not have; nothing when it does. */
export function FeaturePlanBadge({
  feature,
  className,
}: {
  feature: FeatureKey
  className?: string
}) {
  const { requiredPlan } = useEntitlement().feature(feature)
  return requiredPlan ? <PlanBadge plan={requiredPlan} className={className} /> : null
}

/** Marks a resource the plan has paused. Nothing was deleted; the owner can restore it. */
export function PausedBadge({ className }: { className?: string }) {
  return (
    <Badge variant="warning" className={cn('shrink-0', className)} data-testid="paused-badge">
      <PauseCircle className="h-3 w-3" aria-hidden="true" />
      Paused by plan
    </Badge>
  )
}

/** The owner's link to upgrade, or "ask your owner" for everyone else. */
export function UpgradeNextStep({ plan }: { plan: PlanCode | null }) {
  const { canManageBilling } = useEntitlement()
  if (!canManageBilling) return <>Ask your organization owner to upgrade.</>
  return (
    <BillingLink>
      {plan && plan !== 'enterprise' ? `Upgrade to ${PLANS[plan].name}` : 'View plans'}
    </BillingLink>
  )
}

function Note({
  children,
  className,
  testId,
}: {
  children: ReactNode
  className?: string
  testId: string
}) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-lg border bg-muted/40 px-3 py-2 text-[13px] leading-5',
        className
      )}
      data-testid={testId}
    >
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="text-muted-foreground">{children}</p>
    </div>
  )
}

/**
 * Explains, before the user invests effort, that a feature needs a higher
 * plan. Renders nothing when the organization has the feature.
 */
export function FeatureUpgradeNote({
  feature,
  className,
}: {
  feature: FeatureKey
  className?: string
}) {
  const { requiredPlan } = useEntitlement().feature(feature)
  if (!requiredPlan) return null
  const label = FEATURE_LABELS[feature]
  return (
    <Note className={className} testId="feature-upgrade-note">
      <span className="font-medium text-foreground">
        {label.name} is part of the {PLANS[requiredPlan].name} plan.
      </span>{' '}
      {label.outcome} <UpgradeNextStep plan={requiredPlan} />
    </Note>
  )
}

/**
 * Explains that a plan limit is reached before the user fills in a form that
 * cannot be saved. Renders nothing while there is room.
 */
export function LimitReachedNote({
  limit,
  className,
}: {
  limit: CapacityLimitKey
  className?: string
}) {
  const capacity = useEntitlement().capacity(limit)
  if (!capacity.atLimit || capacity.limit === null) return null
  return (
    <Note className={className} testId="limit-reached-note">
      <span className="font-medium text-foreground">
        {capacity.limit === 0
          ? `Your plan does not include ${LIMIT_LABELS[limit].unit}.`
          : `Your plan includes ${formatLimitQuantity(limit, capacity.limit)} and all are in use.`}
      </span>{' '}
      {capacity.limit === 0 ? null : 'Free one up, or get more room: '}
      <UpgradeNextStep plan={capacity.requiredPlan} />
    </Note>
  )
}

/** "3 of 5" for a capped resource; nothing when the plan does not cap it. */
export function CapacityCount({
  limit,
  className,
}: {
  limit: CapacityLimitKey
  className?: string
}) {
  const capacity = useEntitlement().capacity(limit)
  if (capacity.limit === null) return null
  return (
    <span
      className={cn(
        'text-xs tabular-nums text-muted-foreground',
        capacity.atLimit && 'text-status-warning',
        className
      )}
      data-testid="capacity-count"
      title="Used of what your plan includes"
    >
      {capacity.used} of {capacity.limit}
    </span>
  )
}
