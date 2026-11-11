import { createFileRoute } from '@tanstack/react-router'
import { BillingSettingsPage } from '@/components/settings/billing-settings-page'
import { useSettingsTopBar } from '@/components/settings/settings-layout'

export const Route = createFileRoute('/$orgSlug/settings/billing')({
  component: BillingSettingsRoute,
})

function BillingSettingsRoute() {
  useSettingsTopBar('Billing')

  return <BillingSettingsPage />
}
