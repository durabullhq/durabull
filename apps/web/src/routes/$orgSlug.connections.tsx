import { Navigate, createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
export { ConnectionsSettingsPage } from '@/components/settings/connections-settings-page'

const connectionsSearchSchema = z.object({
  create: z
    .union([z.literal(true), z.literal('true'), z.literal(1), z.literal('1')])
    .transform(() => true)
    .optional(),
})

export const Route = createFileRoute('/$orgSlug/connections')({
  validateSearch: zodValidator(connectionsSearchSchema),
  component: LegacyConnectionsRedirect,
})

function LegacyConnectionsRedirect() {
  const { orgSlug } = Route.useParams()
  const { create } = Route.useSearch()
  const search = create ? { create: true as const } : undefined

  return (
    <Navigate
      to="/$orgSlug/settings/connections"
      params={{ orgSlug }}
      search={search}
      replace
    />
  )
}
