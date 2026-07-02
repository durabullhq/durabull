import { Link } from '@tanstack/react-router'
import { Radar, Siren } from 'lucide-react'

const linkClassName =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[0.25rem] px-4 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 hover:text-foreground'

const activeLinkProps = {
  className: 'bg-card text-foreground shadow-sm',
} as const

export function AlertsViewSwitcher({
  orgSlug,
  connectionId,
}: {
  orgSlug: string
  connectionId: string
}) {
  return (
    <nav
      aria-label="Alerts views"
      className="inline-flex h-11 items-center justify-center rounded-md border bg-muted/40 p-1 text-muted-foreground"
    >
      <Link
        to="/$orgSlug/c/$connectionId/alerts"
        params={{ orgSlug, connectionId }}
        activeOptions={{ exact: true, includeSearch: false }}
        activeProps={activeLinkProps}
        className={linkClassName}
      >
        <Siren className="h-4 w-4" />
        Incidents
      </Link>
      <Link
        to="/$orgSlug/c/$connectionId/alerts/rules"
        params={{ orgSlug, connectionId }}
        activeOptions={{ includeSearch: false }}
        activeProps={activeLinkProps}
        className={linkClassName}
      >
        <Radar className="h-4 w-4" />
        Rules
      </Link>
    </nav>
  )
}
