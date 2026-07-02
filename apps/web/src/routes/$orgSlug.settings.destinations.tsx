import { createFileRoute } from '@tanstack/react-router'
import { Send } from 'lucide-react'
import { useMemo } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { AlertDestinationsPage } from '@/components/settings/alert-destinations-page'

export const Route = createFileRoute('/$orgSlug/settings/destinations')({
  component: AlertDestinationsSettingsPage,
})

function AlertDestinationsSettingsPage() {
  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Send className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Settings</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">Alert destinations</span>
        </div>
      ),
    }),
    []
  )

  useAppTopBar(topBarConfig)

  return <AlertDestinationsPage />
}
