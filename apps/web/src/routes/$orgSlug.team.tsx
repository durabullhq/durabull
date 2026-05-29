import { Navigate, createFileRoute } from '@tanstack/react-router'
export { TeamSettingsPage } from '@/components/settings/team-settings-page'

export const Route = createFileRoute('/$orgSlug/team')({
  component: LegacyTeamRedirect,
})

function LegacyTeamRedirect() {
  const { orgSlug } = Route.useParams()

  return <Navigate to="/$orgSlug/settings/team" params={{ orgSlug }} replace />
}
