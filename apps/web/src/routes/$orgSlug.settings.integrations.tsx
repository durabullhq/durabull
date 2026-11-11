import { createFileRoute } from '@tanstack/react-router'
import { IntegrationsSettingsPanel } from '@/components/settings/integrations-settings-panel'
import { useSettingsTopBar } from '@/components/settings/settings-layout'

export const Route = createFileRoute('/$orgSlug/settings/integrations')({
  component: IntegrationsSettingsPage,
})

function IntegrationsSettingsPage() {
  const { orgSlug } = Route.useParams()

  useSettingsTopBar('Integrations')

  return <IntegrationsSettingsPanel orgSlug={orgSlug} />
}
