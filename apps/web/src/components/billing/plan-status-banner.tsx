import { Link } from '@tanstack/react-router'
import { AlertTriangle, PauseCircle, Sparkles, X } from 'lucide-react'
import type { ComponentType } from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { type EnabledEntitlement, useEntitlement } from '@/hooks/use-entitlement'
import { useActiveOrganization } from '@/hooks/use-organization'
import { cn } from '@/lib/utils'
import { formatBillingDate as formatDate } from '../settings/billing/billing-state'
import { PLAN_BANNER_POSITION, PLAN_BANNER_SURFACE, TransitionBanner } from './transition-banner'

export interface PlanStatus {
  /** Identifies this occurrence, so dismissing it does not hide the next one. */
  id: string
  tone: 'warning' | 'info'
  icon: ComponentType<{ className?: string }>
  title: string
  body: string
  /** Label of the owner's link to the billing page. */
  action: string
}

/**
 * The one plan state worth interrupting for, most urgent first: a payment
 * problem, paused resources, an adjustment window about to end, a trial
 * ending. Null when the plan needs no attention. Payment and trial states go
 * to the owner, who can act on them; paused resources affect everyone.
 */
export function planStatus(plan: EnabledEntitlement, today = new Date()): PlanStatus | null {
  const owner = plan.canManageBilling
  const day = today.toISOString().slice(0, 10)
  const status = plan.subscription?.status

  if (owner && (status === 'past_due' || status === 'unpaid')) {
    // Paid access is only on hold once the organization is actually on Free;
    // grace, a beta grant or an override keeps it meanwhile.
    const grace = plan.source === 'payment_grace' ? formatDate(plan.graceExpiresAt) : null
    return plan.source !== 'free'
      ? {
          // Returns each day until it is fixed.
          id: `payment-grace:${day}`,
          tone: 'warning',
          icon: AlertTriangle,
          title: 'Your last payment failed',
          body: grace
            ? `${plan.planName} access continues until ${grace}. Update your payment method to keep it.`
            : 'Update your payment method so the subscription stays paid.',
          action: 'Fix payment',
        }
      : {
          id: `payment-lapsed:${day}`,
          tone: 'warning',
          icon: AlertTriangle,
          title: 'Paid features are on hold',
          body: 'An invoice is unpaid, so this organization is on the Free plan until it is paid. Nothing was deleted.',
          action: 'Fix payment',
        }
  }

  if (plan.suspended.length > 0) {
    const count = plan.suspended.length
    return {
      // Keyed by what is paused, so a later, different pause is announced again.
      id: `paused:${plan.suspended
        .map((item) => item.id)
        .sort()
        .join(',')}`,
      tone: 'warning',
      icon: PauseCircle,
      title:
        count === 1
          ? '1 resource is paused by your plan'
          : `${count} resources are paused by your plan`,
      body: owner
        ? 'Nothing was deleted. Upgrade, free up room, or choose which ones stay enabled.'
        : 'Nothing was deleted. Your organization owner can restore them or upgrade.',
      action: 'Review',
    }
  }

  const windowEnd = formatDate(plan.capacityAdjustmentExpiresAt)
  if (windowEnd) {
    return {
      id: `window:${plan.capacityAdjustmentExpiresAt}`,
      tone: 'warning',
      icon: AlertTriangle,
      title: 'This organization is above its plan’s limits',
      body: owner
        ? `Everything keeps working until ${windowEnd}. After that the newest extra resources are paused, unless you upgrade or choose what stays.`
        : `Everything keeps working until ${windowEnd}. After that the newest extra resources are paused unless your owner upgrades.`,
      action: 'Review',
    }
  }

  const trialEnd = formatDate(plan.subscription?.trialEnd)
  if (owner && plan.notices.includes('trial_ending') && status === 'trialing' && trialEnd) {
    return {
      id: `trial:${plan.subscription?.trialEnd}`,
      tone: 'info',
      icon: Sparkles,
      title: `Your trial ends ${trialEnd}`,
      body: 'Add a payment method to keep your plan. Without one the organization returns to Free and nothing is charged.',
      action: 'Add payment method',
    }
  }

  return null
}

function dismissalKey(orgSlug: string, id: string): string {
  return `durabull:plan-status-dismissed:${orgSlug}:${id}`
}

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

/**
 * App-wide plan status for the active organization. Billing problems used to
 * be visible only to someone who opened Settings → Billing; this surfaces the
 * one that matters wherever the member is working. Falls back to the beta
 * transition banner when nothing more urgent applies.
 */
export function PlanStatusBanner({ orgSlug }: { orgSlug: string }) {
  const { plan } = useEntitlement()
  const { data: activeOrganization } = useActiveOrganization()
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  // Plan state follows the active organization, which switches just after
  // navigation; until it matches this route it may describe the previous one.
  if (!plan || activeOrganization?.slug !== orgSlug) return null
  const status = planStatus(plan)
  if (!status) return <TransitionBanner orgSlug={orgSlug} />

  const key = dismissalKey(orgSlug, status.id)
  // A dismissed status must not also hide the transition banner, which stays
  // up (undismissible) in its final week.
  if (dismissedKey === key || readDismissed(key)) return <TransitionBanner orgSlug={orgSlug} />
  const dismiss = () => {
    try {
      window.localStorage.setItem(key, '1')
    } catch {
      // Dismissal is a convenience; the banner simply returns next visit.
    }
    setDismissedKey(key)
  }
  const Icon = status.icon
  const warning = status.tone === 'warning'

  return (
    <aside
      aria-label="Plan status"
      data-testid="plan-status-banner"
      className={cn(
        PLAN_BANNER_POSITION,
        PLAN_BANNER_SURFACE,
        warning && 'border-status-warning/40'
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            warning ? 'text-status-warning' : 'text-muted-foreground'
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-5">{status.title}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{status.body}</p>
          <div className="mt-2.5 flex flex-wrap items-center justify-end gap-3">
            {plan.canManageBilling ? (
              <Button size="xs" asChild>
                <Link to="/$orgSlug/settings/billing" params={{ orgSlug }} onClick={dismiss}>
                  {status.action}
                </Link>
              </Button>
            ) : (
              <Link
                to="/$orgSlug/settings/billing"
                params={{ orgSlug }}
                className="rounded-sm text-xs font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                See details
              </Link>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}
