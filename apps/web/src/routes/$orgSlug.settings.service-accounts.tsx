import { createFileRoute } from '@tanstack/react-router'
import { Bot } from 'lucide-react'
import { useMemo } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { ServiceAccountsPage } from '@/components/settings/service-accounts-page'

export const Route = createFileRoute('/$orgSlug/settings/service-accounts')({
  component: ServiceAccountsSettingsRoute,
})

function ServiceAccountsSettingsRoute() {
  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Bot className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Settings</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">Service accounts</span>
        </div>
      ),
    }),
    []
  )

  useAppTopBar(topBarConfig)

  return <ServiceAccountsPage />
}
