import { Link } from '@tanstack/react-router'
import { PauseCircle, PowerOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEntitlement } from '@/hooks/use-entitlement'

/**
 * Why a connection's pages are not available: the plan paused it, or it was
 * disabled. Every request for such a connection is refused, so this replaces
 * its pages instead of leaving each one to fail on its own. Alert rules stay
 * reachable, because a connection can only be deleted once its rules are.
 */
export function ConnectionUnavailable({
  orgSlug,
  connectionId,
  connectionName,
  reason,
  showRulesLink,
}: {
  orgSlug: string
  connectionId: string
  connectionName: string
  reason: 'paused' | 'disabled'
  /** False when the alert rules are already what is on screen. */
  showRulesLink: boolean
}) {
  const { canManageBilling } = useEntitlement()
  const paused = reason === 'paused'
  const Icon = paused ? PauseCircle : PowerOff

  return (
    <div
      className="flex flex-wrap items-start gap-3 rounded-lg border border-status-warning/30 bg-status-warning/10 px-4 py-3 text-[13px] leading-5"
      data-testid="connection-unavailable"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-64 space-y-1">
        <div className="font-medium">
          {paused ? `${connectionName} is paused by your plan` : `${connectionName} is disabled`}
        </div>
        <p className="text-muted-foreground">
          {paused
            ? 'This organization has more enabled connections than its plan includes, so this one is paused: its queues, workers and alerts are not available. Nothing in your Redis was changed and its settings are kept.'
            : 'Its queues, workers and alerts are not available while it is disabled. Nothing in your Redis was changed.'}{' '}
          {paused && !canManageBilling
            ? 'Ask your organization owner to restore it or upgrade.'
            : null}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {showRulesLink ? (
          <Button asChild size="xs" variant="outline">
            <Link to="/$orgSlug/c/$connectionId/alerts/rules" params={{ orgSlug, connectionId }}>
              Its alert rules
            </Link>
          </Button>
        ) : null}
        {paused ? (
          canManageBilling ? (
            <Button asChild size="xs">
              <Link to="/$orgSlug/settings/billing" params={{ orgSlug }}>
                Restore or upgrade
              </Link>
            </Button>
          ) : null
        ) : (
          <Button asChild size="xs">
            <Link to="/$orgSlug/settings/connections" params={{ orgSlug }}>
              Connection settings
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
