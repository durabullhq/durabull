import { Link } from '@tanstack/react-router'
import { PauseCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Shown instead of the organization's pages when the signed-in member's own
 * seat is paused by the plan's member limit. Every request for this
 * organization is refused, so without this the member would only see failed
 * loads with no explanation.
 */
export function SeatPaused({
  organizationName,
  otherOrganizations,
}: {
  organizationName: string
  /** The member's other organizations; switching to one leaves this page. */
  otherOrganizations: Array<{ id: string; name: string; slug: string }>
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10" data-testid="seat-paused">
      <EmptyState
        icon={PauseCircle}
        tone="warning"
        title={`Your seat in ${organizationName} is paused`}
        description={
          <>
            {organizationName} has more members than its plan includes, so some seats are paused.
            You are still a member and nothing was removed. Ask the organization owner to restore
            your seat or upgrade the plan; your access returns as soon as they do.
            {otherOrganizations.length > 0 ? ' Your other organizations are not affected.' : ''}
          </>
        }
        actions={
          otherOrganizations.length > 0 ? (
            otherOrganizations.map((other) => (
              <Button key={other.id} asChild variant="outline" size="sm">
                <Link to="/$orgSlug" params={{ orgSlug: other.slug }}>
                  Open {other.name}
                </Link>
              </Button>
            ))
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/setup-organization">Create your own organization</Link>
            </Button>
          )
        }
      />
    </div>
  )
}
