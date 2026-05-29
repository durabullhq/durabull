import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/$orgSlug/settings/')({
  component: SettingsIndexRedirect,
})

function SettingsIndexRedirect() {
  const { orgSlug } = Route.useParams()

  return (
    <Navigate
      to="/$orgSlug/settings/connections"
      params={{ orgSlug }}
      replace
    />
  )
}
