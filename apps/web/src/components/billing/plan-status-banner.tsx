import { Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useEntitlement } from '@/hooks/use-entitlement'
import { useActiveOrganization } from '@/hooks/use-organization'
import { cn } from '@/lib/utils'
import { planStatus } from './plan-status'
import { PLAN_BANNER_POSITION, PLAN_BANNER_SURFACE, TransitionBanner } from './transition-banner'

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
