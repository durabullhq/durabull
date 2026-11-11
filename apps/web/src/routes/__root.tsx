/// <reference types="vite/client" />

import { configureDurabullTelemetry } from '@durabull/analytics/browser'
import type { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import {
  createRootRouteWithContext,
  Navigate,
  Outlet,
  useLocation,
  useParams,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Loader2 } from 'lucide-react'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect, useMemo, useState } from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import { AppTopBar, AppTopBarProvider } from '@/components/app-top-bar'
import { AppUpdateBanner } from '@/components/app-update-banner'
import { CommandPaletteProvider } from '@/components/command-palette'
import { ConnectionProvider } from '@/components/connection-provider'
import { ElectronTitleBarDragStrip } from '@/components/electron-title-bar-drag-strip'
import { ThemeProvider } from '@/components/theme-provider'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'
import { useAppConfig } from '@/hooks/use-app-config'
import { useAppMode } from '@/hooks/use-app-mode'
import { useAuth } from '@/hooks/use-auth'
import { useIsElectronShell } from '@/hooks/use-electron-shell'
import { type Organization, useOrganizations } from '@/hooks/use-organization'
import { usePageViewTracking } from '@/hooks/use-page-view-tracking'
import { APP_BUILD_INFO } from '@/lib/app-version'
import { SESSION_KEYS, type SessionWithActiveOrganization } from '@/lib/session-keys'

/**
 * Hook to get the current organization slug.
 * First checks route params, then falls back to active organization from session.
 * This ensures org-scoped links work even on routes outside /$orgSlug (e.g., /settings).
 */
function useCurrentOrgSlug(): string | undefined {
  const params = useParams({ strict: false })
  const { session } = useAuth()
  const { data: organizations } = useOrganizations()

  // First try to get slug from route params
  const paramsOrgSlug = (params as { orgSlug?: string }).orgSlug
  if (paramsOrgSlug) return paramsOrgSlug

  // Fall back to active organization from session
  const activeOrgId = (session as SessionWithActiveOrganization)?.[
    SESSION_KEYS.ACTIVE_ORGANIZATION_ID
  ]
  if (activeOrgId && organizations) {
    const activeOrg = organizations.find((org: Organization) => org.id === activeOrgId)
    if (activeOrg) return activeOrg.slug
  }

  return undefined
}

const USE_DEVTOOLS = false

// Public routes that don't require authentication (auth-related only)
// Marketing/landing pages are now in the separate docs app
const PUBLIC_ROUTES = ['/login', '/signup', '/auth-error', '/consent']

// Check if a path matches an invite route pattern
const isInviteRoute = (pathname: string) => pathname.startsWith('/invite/')

// Routes that require authentication but not an active organization
const ORG_SETUP_ROUTES = ['/setup-organization']

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  component: RootComponent,
})

function RootComponent() {
  const { config, isLoading } = useAppConfig()
  const isElectronShell = useIsElectronShell()
  const telemetryRuntimeContext = useMemo(
    () => ({
      authless: config.authless,
      env_connections: config.envConnections,
      environment: config.environment,
      persistence: config.persistence,
      runtime: isElectronShell ? 'electron' : 'web',
      stateless: config.stateless,
      app_version: APP_BUILD_INFO.version,
      app_build_id: APP_BUILD_INFO.buildId,
      api_version: config.version.version,
      api_build_id: config.version.buildId,
      release_channel: config.version.releaseChannel,
      deployment: config.telemetry.deployment,
      distribution: config.telemetry.distribution,
      surface: 'app',
    }),
    [
      config.authless,
      config.envConnections,
      config.environment,
      config.persistence,
      config.stateless,
      config.version.version,
      config.version.buildId,
      config.version.releaseChannel,
      config.telemetry.deployment,
      config.telemetry.distribution,
      isElectronShell,
    ]
  )

  useEffect(() => {
    configureDurabullTelemetry({
      enabled: config.telemetry.enabled,
      collectionRequired: config.telemetry.collectionRequired,
      dedupeIdentifiedPosthogEvents: config.telemetry.dedupeIdentifiedPosthogEvents,
      disclosureUrl: config.telemetry.disclosureUrl,
      runtimeContext: telemetryRuntimeContext,
    })
  }, [
    config.telemetry.enabled,
    config.telemetry.collectionRequired,
    config.telemetry.dedupeIdentifiedPosthogEvents,
    config.telemetry.disclosureUrl,
    telemetryRuntimeContext,
  ])

  // Render children without PostHog if config is missing
  const content = (
    <ThemeProvider defaultTheme="dark" storageKey="durabull-theme">
      <ConnectionProvider>
        <RootLayout />
      </ConnectionProvider>
      <AppUpdateBanner />
      <Toaster />
      {USE_DEVTOOLS && <TanStackRouterDevtools position="bottom-right" />}
      {USE_DEVTOOLS && <ReactQueryDevtools buttonPosition="bottom-left" />}
    </ThemeProvider>
  )

  if (isLoading) {
    return content
  }

  // Only wrap with PostHogProvider if API key is configured
  if (!config.posthog.enabled || !config.posthog.key) {
    return content
  }

  return (
    <PostHogProvider
      apiKey={config.posthog.key}
      options={{
        api_host: config.posthog.host,
        // ui_host is required when using a reverse proxy so PostHog features
        // like the toolbar work correctly
        ui_host: config.posthog.uiHost,
        defaults: '2025-05-24',
        capture_exceptions: true, // This enables capturing exceptions using Error Tracking
        persistence: 'localStorage+cookie',
        cross_subdomain_cookie: true,
        debug: config.environment === 'development',
        loaded: (posthog) => {
          try {
            posthog.register(telemetryRuntimeContext)
          } catch {
            // PostHog setup must never block application startup.
          }
        },
      }}
    >
      {content}
    </PostHogProvider>
  )
}

function RootLayout() {
  const { user, isLoading, isAuthenticated } = useAuth()
  const { isAuthless } = useAppMode()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const orgSlug = useCurrentOrgSlug()

  usePageViewTracking()

  // Fetch organizations - we need orgsLoading to show loading state
  const { isLoading: orgsLoading } = useOrganizations()

  const isPublicRoute =
    PUBLIC_ROUTES.includes(location.pathname) || isInviteRoute(location.pathname)
  const isOrgSetupRoute = ORG_SETUP_ROUTES.includes(location.pathname)

  // Public routes render without the app layout (landing, login, signup, invite)
  // These routes handle their own auth redirects in beforeLoad
  if (isPublicRoute) {
    return <Outlet />
  }

  // Org setup route renders without the full app layout
  // This route handles its own auth/org redirect in beforeLoad
  if (isOrgSetupRoute) {
    return <Outlet />
  }

  // Show loading state while checking auth or organizations for protected routes
  if (isLoading || (isAuthenticated && orgsLoading)) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <ElectronTitleBarDragStrip />
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-[13px] text-muted-foreground">Loading…</p>
          </div>
        </div>
      </div>
    )
  }

  // Protected routes require authentication unless authless mode is enabled.
  if (!isAuthenticated && !isAuthless) {
    return <Navigate to="/login" replace />
  }

  const displayUser = {
    name: user?.name ?? 'User',
    email: user?.email ?? '',
    avatar: user?.image ?? '',
  }

  return (
    <AppTopBarProvider>
      <CommandPaletteProvider orgSlug={orgSlug}>
        <div className="flex h-screen overflow-hidden bg-background">
          <aside className="hidden w-60 shrink-0 border-r md:block">
            <AppSidebar orgSlug={orgSlug} user={displayUser} />
          </aside>

          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <AppTopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="h-full p-4 md:p-5">
                <Outlet />
              </div>
            </div>
          </main>

          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetContent side="left" className="h-full w-72 overflow-hidden p-0">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <AppSidebar
                orgSlug={orgSlug}
                user={displayUser}
                variant="sheet"
                onNavigate={() => setMobileNavOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>
      </CommandPaletteProvider>
    </AppTopBarProvider>
  )
}
