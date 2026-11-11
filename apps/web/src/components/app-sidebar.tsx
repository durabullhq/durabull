import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { Link, useLocation, useParams } from '@tanstack/react-router'
import {
  BarChart3,
  BellRing,
  Calendar,
  Database,
  Layers,
  type LucideIcon,
  Monitor,
  Moon,
  Network,
  Search,
  Settings,
  Sun,
} from 'lucide-react'
import { useMemo } from 'react'
import { APP_TOP_BAR_HEIGHT_CLASS } from '@/components/app-top-bar'
import { useCommandPalette } from '@/components/command-palette'
import { useConnection } from '@/components/connection-provider'
import { ConnectionSelector } from '@/components/connection-selector'
import { DurabullLogo } from '@/components/durabull-logo'
import { MacDesktopSidebarControls } from '@/components/mac-desktop-sidebar-controls'
import { NavUser } from '@/components/nav-user'
import { OrganizationSelector } from '@/components/organization-selector'
import { useTheme } from '@/components/theme-provider'
import { CountBadge } from '@/components/ui/count-badge'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getOpenAlertCount, useAlertSummary } from '@/hooks/use-alerts'
import { useAppMode } from '@/hooks/use-app-mode'
import { useIsElectronShell, useIsMacElectronShell } from '@/hooks/use-electron-shell'
import { type UseQueuesOptions, useQueues } from '@/hooks/use-queues'
import { APP_BUILD_INFO } from '@/lib/app-version'
import { isNavLinkActive } from '@/lib/nav-link-active'
import { cn, formatCompactNumber } from '@/lib/utils'

const NAV_QUEUE_COUNT_OPTIONS: UseQueuesOptions = { pageSize: 1 }

export interface AppSidebarUser {
  name: string
  email: string
  avatar: string
}

interface AppSidebarProps {
  orgSlug: string | undefined
  user: AppSidebarUser
  /** Called after any navigation; the mobile sheet uses it to close itself. */
  onNavigate?: () => void
  /** The mobile sheet renders the same sidebar without the desktop window chrome. */
  variant?: 'desktop' | 'sheet'
}

/**
 * The application sidebar: scope (organization + connection), connection-level
 * navigation, then workspace-level settings and the session footer.
 *
 * Shared by the persistent desktop rail and the mobile sheet so the two can
 * never drift apart.
 */
export function AppSidebar({ orgSlug, user, onNavigate, variant = 'desktop' }: AppSidebarProps) {
  const { isAuthless } = useAppMode()
  const isElectronShell = useIsElectronShell()
  const isMacElectronShell = useIsMacElectronShell()
  const { currentConnection } = useConnection()
  const { data: alertSummary } = useAlertSummary()
  const { data: queuesData } = useQueues(NAV_QUEUE_COUNT_OPTIONS)
  const { open: openCommandPalette } = useCommandPalette()
  const params = useParams({ strict: false }) as { connectionId?: string }
  const connectionId = currentConnection?.id

  const openAlerts = useMemo(
    () => getOpenAlertCount(alertSummary?.connections, params.connectionId),
    [alertSummary?.connections, params.connectionId]
  )
  const failedJobs = queuesData?.totalJobCounts.failed ?? 0

  // Without a connection or organization the links fall back to routes that
  // redirect to the right place once one exists.
  const basePath =
    orgSlug && connectionId ? `/${orgSlug}/c/${connectionId}` : orgSlug ? `/${orgSlug}` : '/'
  const settingsPath = orgSlug ? `/${orgSlug}/settings` : '/settings'
  const showMacChrome = variant === 'desktop' && isMacElectronShell
  // Scheduler create/detail pages live under /queues/<name>/scheduled-jobs but
  // belong to Scheduled Jobs, which is what their breadcrumbs say.
  const location = useLocation()
  const isSchedulerRoute = /\/queues\/[^/]+\/scheduled-jobs(\/|$)/.test(location.pathname)

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full min-h-0 flex-col bg-sidebar-background">
        {showMacChrome ? <MacDesktopSidebarControls /> : null}

        {/* Identity row. On macOS desktop the traffic lights own this space instead. */}
        {showMacChrome && isAuthless ? null : (
          <div
            className={cn(
              'flex shrink-0 items-center gap-2 px-3',
              APP_TOP_BAR_HEIGHT_CLASS,
              !showMacChrome && isElectronShell && variant === 'desktop' && 'app-region-drag'
            )}
          >
            <Link
              to="/"
              onClick={onNavigate}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 app-region-no-drag"
              aria-label="Go to dashboard"
            >
              <DurabullLogo className="h-[18px] w-[18px] text-foreground" />
            </Link>
            {isAuthless ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold tracking-tight">Durabull</span>
                <span className="eyebrow rounded-[4px] border px-1 py-px">Local</span>
              </span>
            ) : (
              <div className="min-w-0 flex-1 app-region-no-drag">
                <OrganizationSelector compact />
              </div>
            )}
          </div>
        )}

        <div className="shrink-0 space-y-2 px-3 pb-3">
          <ConnectionSelector />
          <button
            type="button"
            onClick={openCommandPalette}
            className="flex h-8 w-full items-center gap-2 rounded-md border border-transparent px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
            <span className="flex-1 text-left">Search or jump to…</span>
            <Kbd>⌘K</Kbd>
          </button>
        </div>

        <nav
          aria-label="Main"
          className="min-h-0 flex-1 space-y-0.5 overflow-y-auto border-t px-3 py-3"
        >
          <SidebarLink
            to={basePath}
            matchPath={`${basePath}/queues`}
            icon={Layers}
            onNavigate={onNavigate}
            active={isSchedulerRoute ? false : undefined}
            trailing={
              failedJobs > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-mono text-[11px] tabular-nums text-status-danger">
                      {formatCompactNumber(failedJobs)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right">Failed jobs on this connection</TooltipContent>
                </Tooltip>
              ) : null
            }
          >
            Queues
          </SidebarLink>
          <SidebarLink
            to={`${basePath}/alerts`}
            icon={BellRing}
            onNavigate={onNavigate}
            trailing={
              openAlerts > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <CountBadge value={openAlerts} tone="danger" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right">Open incidents</TooltipContent>
                </Tooltip>
              ) : null
            }
          >
            Alerts
          </SidebarLink>
          <SidebarLink to={`${basePath}/analytics`} icon={BarChart3} onNavigate={onNavigate}>
            Analytics
          </SidebarLink>
          <SidebarLink to={`${basePath}/workers`} icon={Network} onNavigate={onNavigate}>
            Workers
          </SidebarLink>
          <SidebarLink
            to={`${basePath}/scheduled-jobs`}
            icon={Calendar}
            onNavigate={onNavigate}
            active={isSchedulerRoute ? true : undefined}
          >
            Scheduled Jobs
          </SidebarLink>
          <SidebarLink to={`${basePath}/redis-keys`} icon={Database} onNavigate={onNavigate}>
            KV Explorer
          </SidebarLink>
        </nav>

        <div className="shrink-0 space-y-0.5 border-t px-3 py-3">
          <SidebarLink to={settingsPath} icon={Settings} onNavigate={onNavigate}>
            Settings
          </SidebarLink>
          {isAuthless ? (
            <LocalSessionFooter />
          ) : (
            <div className="pt-1">
              <NavUser user={user} settingsPath={settingsPath} />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

function SidebarLink({
  to,
  icon: Icon,
  children,
  trailing,
  matchPath,
  onNavigate,
  active,
}: {
  to: string
  icon: LucideIcon
  children: React.ReactNode
  trailing?: React.ReactNode
  matchPath?: string
  onNavigate?: () => void
  /** Overrides path matching for pages whose URL sits under another section. */
  active?: boolean
}) {
  const location = useLocation()
  const isActive = active ?? isNavLinkActive(location.pathname, to, matchPath)

  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        isActive &&
          'bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:-left-3 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-signal'
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0 transition-colors',
          isActive ? 'text-foreground' : 'text-faint group-hover:text-muted-foreground'
        )}
      />
      <span className="flex-1 truncate">{children}</span>
      {trailing}
    </Link>
  )
}

const THEME_OPTIONS = [
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
  { value: 'system', label: 'Match system theme', icon: Monitor },
] as const

/**
 * Footer for authless installs (desktop app, single-user self-hosting). There
 * is no account to show or sign out of, so the footer carries the two things
 * that are still personal: theme and which build is running.
 */
function LocalSessionFooter() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex items-center justify-between gap-2 px-2.5 pt-2">
      <span className="font-mono text-[11px] text-faint" title={`Build ${APP_BUILD_INFO.buildId}`}>
        v{APP_BUILD_INFO.version}
      </span>
      <fieldset
        aria-label="Theme"
        className="flex items-center gap-0.5 rounded-md border bg-card p-0.5"
      >
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            aria-label={label}
            title={label}
            onClick={() => {
              trackEvent(AnalyticsEvents.THEME_CHANGED, { theme: value })
              setTheme(value)
            }}
            className={cn(
              'flex h-5 w-6 items-center justify-center rounded-[4px] text-faint transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              theme === value && 'bg-accent text-foreground'
            )}
          >
            <Icon className="h-3 w-3" />
          </button>
        ))}
      </fieldset>
    </div>
  )
}
