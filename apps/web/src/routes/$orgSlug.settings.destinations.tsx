import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { PageTitle } from '@/components/page-title'
import { AlertDestinationsPage } from '@/components/settings/alert-destinations-page'

export const Route = createFileRoute('/$orgSlug/settings/destinations')({
  component: AlertDestinationsSettingsPage,
})

function AlertDestinationsSettingsPage() {
  const { orgSlug } = Route.useParams()
  const topBarConfig = useMemo(
    () => ({
      left: (
        <PageTitle
          title="Alert destinations"
          crumbs={[{ label: 'Settings', to: `/${orgSlug}/settings` }]}
        />
      ),
    }),
    [orgSlug]
  )

  useAppTopBar(topBarConfig)

  return <AlertDestinationsPage />
}
