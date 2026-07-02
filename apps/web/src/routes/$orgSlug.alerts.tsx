import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { OrgAlertsFeed, type OrgAlertsFilters } from '@/components/alerts/org-alerts-feed'

const orgAlertsSearchSchema = z.object({
  status: z.enum(['open', 'firing', 'acknowledged', 'resolved', 'suppressed', 'all']).catch('open'),
  connection: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/$orgSlug/alerts')({
  validateSearch: zodValidator(orgAlertsSearchSchema),
  component: OrganizationAlertsPage,
})

function OrganizationAlertsPage() {
  const { orgSlug } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()

  return (
    <OrgAlertsFeed
      orgSlug={orgSlug}
      status={search.status}
      connection={search.connection}
      onFiltersChange={(filters: OrgAlertsFilters) =>
        navigate({
          to: '.',
          search: { status: filters.status, connection: filters.connection },
          replace: true,
        })
      }
    />
  )
}
