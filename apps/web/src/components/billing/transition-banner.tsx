import {
  CLOUD_PRICING_URL,
  formatTransitionDeadline,
  TRANSITION_FINAL_WEEK_MS,
} from '@durabull/api-client/billing'
import { Link } from '@tanstack/react-router'
import { CalendarClock, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useBilling } from '@/hooks/use-billing'
import { cn } from '@/lib/utils'

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
  const { data: billing } = useBilling()
  const [dismissedNow, setDismissedNow] = useState(false)

  const transition = billing?.enabled ? billing.transition : null
  if (!billing?.enabled || !transition) return null
  const deadline = new Date(transition.deadline)
  const remainingMs = deadline.getTime() - Date.now()
  if (remainingMs <= 0) return null
  const finalWeek = remainingMs <= TRANSITION_FINAL_WEEK_MS
  const key = dismissalKey(orgSlug, transition.deadline)
  if (!finalWeek && (dismissedNow || readDismissed(key))) return null

  const date = formatTransitionDeadline(deadline)
  const dismiss = () => {
    try {
      window.localStorage.setItem(key, '1')
    } catch {
      // Dismissal is a convenience; the banner simply returns next visit.
    }
    setDismissedNow(true)
  }

  return (
    <aside
      aria-label="Durabull Cloud plans"
      data-testid="transition-banner"
      className={cn(
        'fixed bottom-4 left-4 z-40 w-[calc(100vw-2rem)] max-w-sm rounded-lg border bg-background/95 p-3 text-foreground shadow-2xl shadow-black/25 backdrop-blur supports-[backdrop-filter]:bg-background/85',
        finalWeek ? 'border-status-warning/40' : 'border-primary/30'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            finalWeek ? 'bg-status-warning/15 text-status-warning' : 'bg-primary/10 text-primary'
          )}
        >
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">
            {finalWeek ? 'Beta access ends this week' : 'Durabull Cloud is moving to plans'}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            This organization keeps full access until {date}, then uses the Free plan unless{' '}
            {billing.canManageBilling ? 'you choose a plan' : 'an owner chooses a plan'}.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <a
              href={CLOUD_PRICING_URL}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline"
            >
              See pricing
            </a>
            {billing.canManageBilling ? (
              <Button size="sm" asChild>
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
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </aside>
  )
}
