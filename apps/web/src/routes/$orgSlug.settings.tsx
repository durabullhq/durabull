import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SettingsLayout } from '@/components/settings/settings-layout'

export const Route = createFileRoute('/$orgSlug/settings')({
  component: OrgSettingsLayout,
})

function OrgSettingsLayout() {
  const { orgSlug } = Route.useParams()

  return (
    <SettingsLayout orgSlug={orgSlug}>
      <Outlet />
    </SettingsLayout>
  )
}
