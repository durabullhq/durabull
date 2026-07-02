import { createFileRoute } from '@tanstack/react-router'
import { ConnectionRulesView } from '@/components/alerts/connection-rules-view'

export const Route = createFileRoute('/$orgSlug/c/$connectionId/alerts/rules/')({
  component: ConnectionAlertRulesRoute,
})

function ConnectionAlertRulesRoute() {
  const { orgSlug, connectionId } = Route.useParams()

  return <ConnectionRulesView orgSlug={orgSlug} connectionId={connectionId} />
}
