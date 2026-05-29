import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { ConnectionsSettingsPage } from '@/components/settings/connections-settings-page'

const settingsConnectionsSearchSchema = z.object({
  create: z
    .union([z.literal(true), z.literal('true'), z.literal(1), z.literal('1')])
    .transform(() => true)
    .optional(),
})

export const Route = createFileRoute('/$orgSlug/settings/connections')({
  validateSearch: zodValidator(settingsConnectionsSearchSchema),
  component: SettingsConnectionsRoute,
})

function SettingsConnectionsRoute() {
  const { create } = Route.useSearch()

  return <ConnectionsSettingsPage createFromSearch={Boolean(create)} />
}
