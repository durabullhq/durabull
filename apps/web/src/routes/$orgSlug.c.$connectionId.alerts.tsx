import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/$orgSlug/c/$connectionId/alerts')({
  component: ConnectionAlertsLayout,
})

function ConnectionAlertsLayout() {
  return <Outlet />
}
