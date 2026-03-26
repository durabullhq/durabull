import { zodValidator } from '@tanstack/zod-adapter'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { ConnectionAlertsWorkspace } from '@/components/alerts/connection-alerts-workspace'

const alertPageSearchSchema = z.object({
  tab: z.enum(['rules', 'history']).catch('rules'),
})

export const Route = createFileRoute('/$orgSlug/c/$connectionId/alerts/')({
  validateSearch: zodValidator(alertPageSearchSchema),
  component: ConnectionAlertsIndexRoute,
})

function ConnectionAlertsIndexRoute() {
  const { orgSlug, connectionId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()

  return (
    <ConnectionAlertsWorkspace
      orgSlug={orgSlug}
      connectionId={connectionId}
      tab={search.tab}
      onTabChange={(tab) =>
        navigate({
          to: '.',
          search: { tab },
          replace: true,
        })
      }
    />
  )
}
