import {
  CLOUD_PRICING_URL,
  formatTransitionDeadline,
  TRANSITION_FINAL_WEEK_MS,
} from '@durabull/api-client/billing'
import { Link } from '@tanstack/react-router'
import { CalendarClock, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useEntitlement } from '@/hooks/use-entitlement'
import { useActiveOrganization } from '@/hooks/use-organization'
import { cn } from '@/lib/utils'

/**
 * Bottom-left, but beside the desktop sidebar rather than on top of it: the
 * user menu lives in the sidebar's bottom corner and must stay reachable,
 * above all while a banner cannot be dismissed.
 */
export const PLAN_BANNER_POSITION =
  'fixed bottom-4 left-4 z-40 w-[calc(100vw-2rem)] max-w-sm md:left-64'

/** The floating card both plan banners use. */
export const PLAN_BANNER_SURFACE =
  'rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg'

function dismissalKey(orgSlug: string, deadline: string): string {
  return `durabull:transition-banner-dismissed:${orgSlug}:${deadline}`
}

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

/**
 * Beta transition notice for every member of an organization whose beta
 * access ends on a set date. The server includes it only after the notice
 * email went out and until the organization chooses a plan. Owners can act;
 * other members are told to ask an owner. Dismissible until the final week.
 */
export function TransitionBanner({ orgSlug }: { orgSlug: string }) {
  const { plan: billing } = useEntitlement()
  const { data: activeOrganization } = useActiveOrganization()
  // Scoped to the organization and deadline it was dismissed for.
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  // Billing follows the active organization, which switches after navigation;
  // until it matches this route the data may belong to the previous one.
  const transition = billing && activeOrganization?.slug === orgSlug ? billing.transition : null
  if (!billing || !transition) return null
  const deadline = new Date(transition.deadline)
  const remainingMs = deadline.getTime() - Date.now()
  if (remainingMs <= 0) return null
  const finalWeek = remainingMs <= TRANSITION_FINAL_WEEK_MS
  const key = dismissalKey(orgSlug, transition.deadline)
  if (!finalWeek && (dismissedKey === key || readDismissed(key))) return null

  const date = formatTransitionDeadline(deadline)
  const dismiss = () => {
    try {
      window.localStorage.setItem(key, '1')
    } catch {
      // Dismissal is a convenience; the banner simply returns next visit.
    }
    setDismissedKey(key)
  }

  return (
    <aside
      aria-label="Durabull Cloud plans"
      data-testid="transition-banner"
      className={cn(
        // Sits clear of the sidebar footer on desktop so it never covers the session menu.
        PLAN_BANNER_POSITION,
        PLAN_BANNER_SURFACE,
        finalWeek && 'border-status-warning/40'
      )}
    >
      <div className="flex items-start gap-3">
        <CalendarClock
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            finalWeek ? 'text-status-warning' : 'text-muted-foreground'
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-5">
            {finalWeek ? 'Beta access ends this week' : 'Durabull Cloud is moving to plans'}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            This organization keeps full access until {date}, then uses the Free plan unless{' '}
            {billing.canManageBilling ? 'you choose a plan' : 'an owner chooses a plan'}.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center justify-end gap-3">
            <a
              href={CLOUD_PRICING_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-sm text-xs font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              See pricing
            </a>
            {billing.canManageBilling ? (
              <Button size="xs" asChild>
                <Link to="/$orgSlug/settings/billing" params={{ orgSlug }}>
                  Choose a plan
                </Link>
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Ask your organization owner.</span>
            )}
          </div>
        </div>
        {finalWeek ? null : (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss until the final week"
            className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </aside>
  )
}
