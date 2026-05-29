import { createFileRoute } from '@tanstack/react-router'
import { TeamSettingsPage } from '@/components/settings/team-settings-page'

export const Route = createFileRoute('/$orgSlug/settings/team')({
  component: TeamSettingsPage,
})
