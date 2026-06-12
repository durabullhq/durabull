/// <reference types="vite/client" />

import { configureDurabullTelemetry } from '@durabull/analytics/browser'
import type { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import {
  createRootRouteWithContext,
  Link,
  Navigate,
  Outlet,
  useLocation,
  useParams,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import {
  BarChart3,
  BellRing,
  Calendar,
  Database,
  Layers,
  Loader2,
  Network,
  Settings,
} from 'lucide-react'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect, useMemo, useState } from 'react'
import { AppUpdateBanner } from '@/components/app-update-banner'
import { APP_TOP_BAR_HEIGHT_CLASS, AppTopBar, AppTopBarProvider } from '@/components/app-top-bar'
import { ConnectionProvider, useConnection } from '@/components/connection-provider'
import { ConnectionSelector } from '@/components/connection-selector'
import { DurabullLogo } from '@/components/durabull-logo'
import { ElectronTitleBarDragStrip } from '@/components/electron-title-bar-drag-strip'
import { MacDesktopSidebarControls } from '@/components/mac-desktop-sidebar-controls'
import { NavUser } from '@/components/nav-user'
import { OrganizationSelector } from '@/components/organization-selector'
import { ThemeProvider } from '@/components/theme-provider'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'
import { getOpenAlertCount, useAlertSummary } from '@/hooks/use-alerts'
import { useAppConfig } from '@/hooks/use-app-config'
import { useAppMode } from '@/hooks/use-app-mode'
import { useAuth } from '@/hooks/use-auth'
import { useIsElectronShell } from '@/hooks/use-electron-shell'
import { type Organization, useOrganizations } from '@/hooks/use-organization'
import { usePageViewTracking } from '@/hooks/use-page-view-tracking'
import { APP_BUILD_INFO } from '@/lib/app-version'
import { type NavMatchMode, isNavLinkActive } from '@/lib/nav-link-active'
import { SESSION_KEYS, type SessionWithActiveOrganization } from '@/lib/session-keys'
import { cn } from '@/lib/utils'

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
  const isElectronShell = useIsElectronShell()
  const orgSlug = useCurrentOrgSlug()
  const settingsPath = orgSlug ? `/${orgSlug}/settings/connections` : '/settings'

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
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading...</p>
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
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - inspired by developer-focused dashboards */}
          <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar-background md:flex">
            <MacDesktopSidebarControls />
            <div
              className={cn(
                'shrink-0 border-b',
                APP_TOP_BAR_HEIGHT_CLASS,
                isElectronShell && 'app-region-drag'
              )}
            >
              <div
                className={cn('flex h-full items-center', isElectronShell && 'pointer-events-none')}
              >
                <Link
                  to="/"
                  className={cn(
                    'flex h-full w-14 shrink-0 items-center justify-center border-r border-border transition-opacity hover:opacity-85',
                    isElectronShell && 'pointer-events-auto app-region-no-drag'
                  )}
                  aria-label="Go to dashboard"
                >
                  <DurabullLogo className="h-5 w-5 text-black dark:text-white" />
                </Link>
                {!isAuthless && (
                  <div
                    className={cn(
                      'min-w-0 flex-1 px-3',
                      isElectronShell && 'pointer-events-auto app-region-no-drag'
                    )}
                  >
                    <OrganizationSelector compact />
                  </div>
                )}
              </div>
            </div>

            {/* Connection Selector */}
            <div className="shrink-0 border-b p-3">
              <div className="eyebrow mb-2 px-2">Connection</div>
              <ConnectionSelector />
            </div>

            {/* Navigation - now uses connection-based URLs */}
            <SidebarNav />

            {/* User menu at bottom */}
            <div className="shrink-0 border-t p-3">
              <NavUser user={displayUser} settingsPath={settingsPath} />
            </div>
          </aside>

          {/* Main content */}
          <main className="min-w-0 flex flex-1 flex-col overflow-hidden">
            <AppTopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="h-full p-4 md:p-6">
                <Outlet />
              </div>
            </div>
          </main>

          {/* Mobile navigation sheet */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetContent
              side="left"
              className="flex h-full w-72 flex-col overflow-hidden p-0 bg-sidebar-background"
            >
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <div
                className={cn(
                  'shrink-0 border-b',
                  APP_TOP_BAR_HEIGHT_CLASS,
                  isElectronShell && 'app-region-drag'
                )}
              >
                <div
                  className={cn(
                    'flex h-full items-center',
                    isElectronShell && 'pointer-events-none'
                  )}
                >
                  <Link
                    to="/"
                    className={cn(
                      'flex h-full w-14 shrink-0 items-center justify-center border-r border-border transition-opacity hover:opacity-85',
                      isElectronShell && 'pointer-events-auto app-region-no-drag'
                    )}
                    onClick={() => setMobileNavOpen(false)}
                    aria-label="Go to dashboard"
                  >
                    <DurabullLogo className="h-5 w-5 text-black dark:text-white" />
                  </Link>
                  {!isAuthless && (
                    <div
                      className={cn(
                        'min-w-0 flex-1 px-3',
                        isElectronShell && 'pointer-events-auto app-region-no-drag'
                      )}
                    >
                      <OrganizationSelector compact />
                    </div>
                  )}
                </div>
              </div>

              {/* Connection Selector */}
              <div className="shrink-0 border-b p-3">
                <div className="eyebrow mb-2 px-2">Connection</div>
                <ConnectionSelector />
              </div>

              {/* Navigation */}
              <MobileSidebarNav onNavigate={() => setMobileNavOpen(false)} />

              {/* User menu at bottom */}
              <div className="shrink-0 border-t p-3 bg-sidebar-background">
                <NavUser user={displayUser} settingsPath={settingsPath} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </AppTopBarProvider>
  )
}

function SidebarNav() {
  const { currentConnection } = useConnection()
  const { data: alertSummary } = useAlertSummary()
  const params = useParams({ strict: false }) as { connectionId?: string }
  const connectionId = currentConnection?.id
  // Get orgSlug from route params or fall back to active organization
  const orgSlug = useCurrentOrgSlug()
  const openAlertsBadgeCount = useMemo(
    () => getOpenAlertCount(alertSummary?.connections, params.connectionId),
    [alertSummary?.connections, params.connectionId]
  )

  // If no connection or org is selected, we can still show nav but links won't work
  // The index page will handle redirecting to a connection
  const basePath =
    orgSlug && connectionId ? `/${orgSlug}/c/${connectionId}` : orgSlug ? `/${orgSlug}` : '/'

  return (
    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
      <div className="eyebrow mb-2 px-2">Platform</div>
      <NavLink to={basePath} icon={Layers}>
        Queues
      </NavLink>
      <NavLink to={`${basePath}/alerts`} icon={BellRing} badge={openAlertsBadgeCount}>
        Alerts
      </NavLink>
      <NavLink to={`${basePath}/analytics`} icon={BarChart3}>
        Analytics
      </NavLink>
      <NavLink to={`${basePath}/workers`} icon={Network}>
        Workers
      </NavLink>
      <NavLink to={`${basePath}/scheduled-jobs`} icon={Calendar}>
        Scheduled Jobs
      </NavLink>
      <NavLink to={`${basePath}/redis-keys`} icon={Database}>
        KV Explorer
      </NavLink>
      <NavLink
        to={orgSlug ? `/${orgSlug}/settings` : '/settings'}
        icon={Settings}
        matchMode="section"
      >
        Settings
      </NavLink>
    </nav>
  )
}

function MobileSidebarNav({ onNavigate }: { onNavigate: () => void }) {
  const { currentConnection } = useConnection()
  const { data: alertSummary } = useAlertSummary()
  const params = useParams({ strict: false }) as { connectionId?: string }
  const connectionId = currentConnection?.id
  // Get orgSlug from route params or fall back to active organization
  const orgSlug = useCurrentOrgSlug()
  const openAlertsBadgeCount = useMemo(
    () => getOpenAlertCount(alertSummary?.connections, params.connectionId),
    [alertSummary?.connections, params.connectionId]
  )

  const basePath =
    orgSlug && connectionId ? `/${orgSlug}/c/${connectionId}` : orgSlug ? `/${orgSlug}` : '/'

  return (
    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
      <div className="eyebrow mb-2 px-2">Platform</div>
      <MobileNavLink to={basePath} icon={Layers} onNavigate={onNavigate}>
        Queues
      </MobileNavLink>
      <MobileNavLink
        to={`${basePath}/alerts`}
        icon={BellRing}
        onNavigate={onNavigate}
        badge={openAlertsBadgeCount}
      >
        Alerts
      </MobileNavLink>
      <MobileNavLink to={`${basePath}/analytics`} icon={BarChart3} onNavigate={onNavigate}>
        Analytics
      </MobileNavLink>
      <MobileNavLink to={`${basePath}/workers`} icon={Network} onNavigate={onNavigate}>
        Workers
      </MobileNavLink>
      <MobileNavLink to={`${basePath}/scheduled-jobs`} icon={Calendar} onNavigate={onNavigate}>
        Scheduled Jobs
      </MobileNavLink>
      <MobileNavLink to={`${basePath}/redis-keys`} icon={Database} onNavigate={onNavigate}>
        KV Explorer
      </MobileNavLink>
      <MobileNavLink
        to={orgSlug ? `/${orgSlug}/settings` : '/settings'}
        icon={Settings}
        onNavigate={onNavigate}
        matchMode="section"
      >
        Settings
      </MobileNavLink>
    </nav>
  )
}

function MobileNavLink({
  to,
  icon: Icon,
  children,
  onNavigate,
  badge,
  matchMode = 'default',
}: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  onNavigate: () => void
  badge?: number
  matchMode?: NavMatchMode
}) {
  const location = useLocation()

  const isActive = isNavLinkActive(location.pathname, to, matchMode)

  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        isActive &&
          'bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-signal'
      )}
    >
      <Icon className={cn('h-4 w-4', isActive ? 'text-signal' : 'text-muted-foreground')} />
      <span className="flex-1">{children}</span>
      {badge && badge > 0 ? (
        <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
          {badge}
        </Badge>
      ) : null}
    </Link>
  )
}

function NavLink({
  to,
  icon: Icon,
  children,
  badge,
  matchMode = 'default',
}: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  badge?: number
  matchMode?: NavMatchMode
}) {
  const location = useLocation()

  const isActive = isNavLinkActive(location.pathname, to, matchMode)

  return (
    <Link
      to={to}
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        isActive &&
          'bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-signal'
      )}
    >
      <Icon className={cn('h-4 w-4', isActive ? 'text-signal' : 'text-muted-foreground')} />
      <span className="flex-1">{children}</span>
      {badge && badge > 0 ? (
        <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
          {badge}
        </Badge>
      ) : null}
    </Link>
  )
}
