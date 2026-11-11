import { createFileRoute } from '@tanstack/react-router'
import { ServiceAccountsPage } from '@/components/settings/service-accounts-page'
import { LocalInstallNotice, useSettingsTopBar } from '@/components/settings/settings-layout'
import { useAppMode } from '@/hooks/use-app-mode'

export const Route = createFileRoute('/$orgSlug/settings/service-accounts')({
  component: ServiceAccountsSettingsRoute,
})

function ServiceAccountsSettingsRoute() {
  const { isAuthless } = useAppMode()

  useSettingsTopBar('Service accounts')

  // Service accounts are managed by organization admins; a local install has no accounts.
  if (isAuthless) return <LocalInstallNotice />
  return <ServiceAccountsPage />
}
