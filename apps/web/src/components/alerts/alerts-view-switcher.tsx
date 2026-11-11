import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { CountBadge } from '@/components/ui/count-badge'
import { getOpenAlertCount, useAlertSummary, useConnectionAlertRules } from '@/hooks/use-alerts'

const tabClassName =
  'relative -mb-px inline-flex h-9 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-0.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[status=active]:border-foreground data-[status=active]:text-foreground'

const activeTabProps = { 'aria-current': 'page' } as const

/**
 * The alerts area is one place with three views: what is firing (Incidents),
 * what watches for it (Rules), and who gets told (Destinations).
 */
export function AlertsViewSwitcher({
  orgSlug,
  connectionId,
}: {
  orgSlug: string
  connectionId: string
}) {
  const { data: summary } = useAlertSummary()
  const { data: rulesData } = useConnectionAlertRules(connectionId)
  const openCount = useMemo(
    () => getOpenAlertCount(summary?.connections, connectionId),
    [summary?.connections, connectionId]
  )
  const ruleCount = rulesData?.rules.length

  return (
    <nav aria-label="Alerts views" className="flex items-center gap-5">
      <Link
        to="/$orgSlug/c/$connectionId/alerts"
        params={{ orgSlug, connectionId }}
        activeOptions={{ exact: true, includeSearch: false }}
        activeProps={activeTabProps}
        className={tabClassName}
      >
        Incidents
        {openCount > 0 ? <CountBadge value={openCount} tone="danger" /> : null}
      </Link>
      <Link
        to="/$orgSlug/c/$connectionId/alerts/rules"
        params={{ orgSlug, connectionId }}
        activeOptions={{ includeSearch: false }}
        activeProps={activeTabProps}
        className={tabClassName}
      >
        Rules
        {ruleCount !== undefined ? <CountBadge value={ruleCount} /> : null}
      </Link>
      <Link
        to="/$orgSlug/c/$connectionId/alerts/destinations"
        params={{ orgSlug, connectionId }}
        activeOptions={{ includeSearch: false }}
        activeProps={activeTabProps}
        className={tabClassName}
      >
        Destinations
      </Link>
    </nav>
  )
}

/** Tab row for every alerts view, with an optional right-aligned control slot. */
export function AlertsHeader({
  orgSlug,
  connectionId,
  children,
}: {
  orgSlug: string
  connectionId: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b">
      <AlertsViewSwitcher orgSlug={orgSlug} connectionId={connectionId} />
      {children ? <div className="flex items-center gap-2 pb-1.5">{children}</div> : null}
    </div>
  )
}
