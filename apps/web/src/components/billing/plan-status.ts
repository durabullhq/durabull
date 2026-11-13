import { AlertTriangle, PauseCircle, Sparkles } from 'lucide-react'
import type { ComponentType } from 'react'
import type { EnabledEntitlement } from '@/hooks/use-entitlement'
import { formatBillingDate as formatDate } from '../settings/billing/billing-state'

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
      // Keyed by what is paused and when each pause began, so a later pause
      // is announced again, even of a resource whose earlier pause was dismissed.
      id: `paused:${plan.suspended
        .map((item) => `${item.id}@${item.since}`)
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
