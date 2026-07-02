import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import {
  ConnectionIncidentsView,
  type IncidentStatusFilter,
} from '@/components/alerts/connection-incidents-view'

const incidentsSearchSchema = z.object({
  status: z.enum(['open', 'firing', 'acknowledged', 'resolved', 'suppressed', 'all']).catch('open'),
  queue: z.string().optional().catch(undefined),
  /** Legacy deep-link param: `?tab=rules` redirects to the rules route. */
  tab: z.enum(['rules', 'history']).optional().catch(undefined),
})

export const Route = createFileRoute('/$orgSlug/c/$connectionId/alerts/')({
  validateSearch: zodValidator(incidentsSearchSchema),
  beforeLoad: ({ search, params }) => {
    if (search.tab === 'rules') {
      throw redirect({
        to: '/$orgSlug/c/$connectionId/alerts/rules',
        params,
        replace: true,
      })
    }
    // Legacy history tab maps to the resolved-incidents filter.
    if (search.tab === 'history') {
      throw redirect({
        to: '/$orgSlug/c/$connectionId/alerts',
        params,
        search: { status: 'resolved' },
        replace: true,
      })
    }
  },
  component: ConnectionAlertsIndexRoute,
})

function ConnectionAlertsIndexRoute() {
  const { orgSlug, connectionId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()

  return (
    <ConnectionIncidentsView
      orgSlug={orgSlug}
      connectionId={connectionId}
      status={search.status}
      queue={search.queue}
      onStatusChange={(status: IncidentStatusFilter) =>
        navigate({
          to: '.',
          search: { status, queue: search.queue },
          replace: true,
        })
      }
    />
  )
}
