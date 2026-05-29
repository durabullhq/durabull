import { createFileRoute } from '@tanstack/react-router'
import { Shield } from 'lucide-react'
import { useMemo } from 'react'
import { AuthenticationSettingsPanel } from '@/components/settings/authentication-settings-panel'
import { useAppTopBar } from '@/components/app-top-bar'

export const Route = createFileRoute('/$orgSlug/settings/authentication')({
  component: AuthenticationSettingsPage,
})

function AuthenticationSettingsPage() {
  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Shield className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Settings</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">Authentication</span>
        </div>
      ),
    }),
    []
  )

  useAppTopBar(topBarConfig)

  return <AuthenticationSettingsPanel />
}
