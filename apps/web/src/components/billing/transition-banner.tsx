import { Link } from '@tanstack/react-router'
import { CalendarClock, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useBilling } from '@/hooks/use-billing'
import { cn } from '@/lib/utils'

const PRICING_URL = 'https://durabull.io/pricing'
const FINAL_WEEK_MS = 7 * 24 * 60 * 60 * 1000
const SUBSCRIBED_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']
const DEADLINE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

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
 * access ends on a set date and that has not chosen a plan. Owners can act;
 * other members are told to ask an owner. Dismissible until the final week.
 */
export function TransitionBanner({ orgSlug }: { orgSlug: string }) {
  const { data: billing } = useBilling()
  const deadline = billing?.enabled ? billing.migrationGrantExpiresAt : null
  const [dismissed, setDismissed] = useState(() =>
    deadline ? readDismissed(dismissalKey(orgSlug, deadline)) : false
  )

  if (!billing?.enabled || !deadline) return null
  const subscribed =
    billing.subscription !== null && SUBSCRIBED_STATUSES.includes(billing.subscription.status)
  const remainingMs = new Date(deadline).getTime() - Date.now()
  if (subscribed || remainingMs <= 0) return null
  const finalWeek = remainingMs <= FINAL_WEEK_MS
  if (dismissed && !finalWeek) return null

  const date = DEADLINE_FORMAT.format(new Date(deadline))
  const dismiss = () => {
    try {
      window.localStorage.setItem(dismissalKey(orgSlug, deadline), '1')
    } catch {
      // Dismissal is a convenience; the banner simply returns next visit.
    }
    setDismissed(true)
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
            {finalWeek ? `Beta access ends ${date}` : 'Durabull Cloud is moving to plans'}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            This organization keeps full access until {date}, then uses the Free plan unless{' '}
            {billing.canManageBilling ? 'you choose a plan' : 'an owner chooses a plan'}.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <a
              href={PRICING_URL}
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
