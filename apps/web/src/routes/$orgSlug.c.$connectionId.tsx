import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'
import { isUsableConnection, useConnection } from '@/components/connection-provider'
import { ConnectionUnavailable } from '@/components/connection-unavailable'

/**
 * Layout route for connection-scoped pages within an organization.
 * All routes under /$orgSlug/c/:connectionId use this layout.
 */
export const Route = createFileRoute('/$orgSlug/c/$connectionId')({
  component: ConnectionLayout,
})

/** The one page a paused or disabled connection still serves: its alert rules. */
function isAlertRulesPath(pathname: string): boolean {
  return /\/alerts\/rules\/?$/.test(pathname)
}

function ConnectionLayout() {
  const { orgSlug, connectionId } = Route.useParams()
  const { connections } = useConnection()
  const pathname = useLocation({ select: (location) => location.pathname })
  const connection = connections.find((candidate) => candidate.id === connectionId)

  // The server refuses every request for a paused or disabled connection.
  // Explain that once here rather than letting each page fail separately.
  if (connection && !isUsableConnection(connection)) {
    const onRules = isAlertRulesPath(pathname)
    return (
      <div className="space-y-4">
        <ConnectionUnavailable
          orgSlug={orgSlug}
          connectionId={connectionId}
          connectionName={connection.name}
          reason={connection.suspended ? 'paused' : 'disabled'}
          showRulesLink={!onRules}
        />
        {onRules ? <Outlet /> : null}
      </div>
    )
  }

  return <Outlet />
}
