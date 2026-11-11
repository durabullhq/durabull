import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { AlertsHeader } from '@/components/alerts/alerts-view-switcher'
import { useAppTopBar } from '@/components/app-top-bar'
import { PageTitle } from '@/components/page-title'
import { AlertDestinationsPage } from '@/components/settings/alert-destinations-page'

export const Route = createFileRoute('/$orgSlug/c/$connectionId/alerts/destinations')({
  component: ConnectionAlertDestinationsRoute,
})

/**
 * Destinations are organization-wide, but rules cannot notify anyone without
 * them — so they are managed here, next to the rules that use them, as well
 * as under Settings.
 */
function ConnectionAlertDestinationsRoute() {
  const { orgSlug, connectionId } = Route.useParams()
  const topBarConfig = useMemo(() => ({ left: <PageTitle title="Alerts" /> }), [])
  useAppTopBar(topBarConfig)

  return (
    <div className="space-y-4">
      <AlertsHeader orgSlug={orgSlug} connectionId={connectionId} />
      <AlertDestinationsPage />
    </div>
  )
}
