import { createFileRoute } from '@tanstack/react-router'
import { AuthenticationSettingsPanel } from '@/components/settings/authentication-settings-panel'
import { LocalInstallNotice, useSettingsTopBar } from '@/components/settings/settings-layout'
import { useAppMode } from '@/hooks/use-app-mode'

export const Route = createFileRoute('/$orgSlug/settings/authentication')({
  component: AuthenticationSettingsPage,
})

function AuthenticationSettingsPage() {
  const { isAuthless } = useAppMode()

  useSettingsTopBar('Authentication')

  // Linking sign-in providers needs an account; a local install has none.
  if (isAuthless) return <LocalInstallNotice />
  return <AuthenticationSettingsPanel />
}
