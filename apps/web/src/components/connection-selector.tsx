import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { Link, useParams } from '@tanstack/react-router'
import {
  AlertCircle,
  Check,
  ChevronsUpDown,
  Cloud,
  Code,
  Loader2,
  Server,
  Settings2,
} from 'lucide-react'

// Connection types - matches API response
type ConnectionEnvironment = 'development' | 'staging' | 'production'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isUsableConnection } from '@/lib/connection-usable'
import { cn } from '@/lib/utils'
import { useConnection } from './connection-provider'

// Environment configuration - matches the connections page
const environmentConfig: Record<
  ConnectionEnvironment,
  {
    label: string
    /** Three-letter tag shown beside the connection name. */
    short: string
    icon: typeof Code
    color: string
    bgColor: string
    dot: string
  }
> = {
  development: {
    label: 'Development',
    short: 'DEV',
    icon: Code,
    color: 'text-status-success',
    bgColor: 'bg-status-success/10',
    dot: 'bg-status-success',
  },
  staging: {
    label: 'Staging',
    short: 'STG',
    icon: Server,
    color: 'text-status-warning',
    bgColor: 'bg-status-warning/10',
    dot: 'bg-status-warning',
  },
  production: {
    label: 'Production',
    short: 'PROD',
    icon: Cloud,
    color: 'text-status-danger',
    bgColor: 'bg-status-danger/10',
    dot: 'bg-status-danger',
  },
}

// Order for displaying environments
const environmentOrder: ConnectionEnvironment[] = ['production', 'staging', 'development']

function getEnvironmentConfig(env: ConnectionEnvironment | null) {
  return environmentConfig[env ?? 'development']
}

const triggerShell =
  'flex h-9 w-full items-center gap-2 rounded-md border bg-card px-2.5 text-left shadow-xs'

function EnvTag({ env }: { env: ConnectionEnvironment | null }) {
  const config = getEnvironmentConfig(env)
  return (
    <span
      className={cn('shrink-0 font-mono text-[10px] font-medium tracking-wider', config.color)}
      title={config.label}
    >
      {config.short}
    </span>
  )
}

export function ConnectionSelector() {
  const { connections, currentConnection, setCurrentConnection, isLoading, error } = useConnection()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string }

  if (isLoading) {
    return (
      <div className={cn(triggerShell, 'text-muted-foreground')}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="text-[13px]">Loading…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn(triggerShell, 'border-destructive/40 bg-destructive/5 text-destructive')}>
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="text-[13px]">Connection error</span>
      </div>
    )
  }

  if (connections.length === 0) {
    return (
      <div
        className={cn(
          triggerShell,
          'border-status-warning/40 bg-status-warning/5 text-status-warning'
        )}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="text-[13px]">No connections</span>
      </div>
    )
  }

  // Group connections by environment
  const connectionsByEnv = environmentOrder.reduce(
    (acc, env) => {
      const envConnections = connections.filter((c) => (c.environment ?? 'development') === env)
      if (envConnections.length > 0) {
        acc[env] = envConnections
      }
      return acc
    },
    {} as Partial<Record<ConnectionEnvironment, typeof connections>>
  )

  // A single connection has nothing to switch to: show it as a static label.
  if (connections.length === 1) {
    const conn = connections[0]
    return (
      <div className={triggerShell}>
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            getEnvironmentConfig(conn.environment).dot
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {conn.name}
        </span>
        <EnvTag env={conn.environment} />
      </div>
    )
  }

  const currentEnv = currentConnection ? getEnvironmentConfig(currentConnection.environment) : null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="connection-selector"
        aria-label="Switch connection"
        className={cn(
          triggerShell,
          'outline-none transition-colors hover:border-border-strong hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-accent'
        )}
      >
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', currentEnv?.dot ?? 'bg-status-neutral')}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {currentConnection?.name ?? 'Select connection'}
        </span>
        {currentConnection ? <EnvTag env={currentConnection.environment} /> : null}
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-faint" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-60"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        {environmentOrder.map((env) => {
          const envConnections = connectionsByEnv[env]
          if (!envConnections || envConnections.length === 0) return null

          const envConfig = environmentConfig[env]

          return (
            <DropdownMenuGroup key={env}>
              <DropdownMenuLabel className="eyebrow pb-1 pt-2">{envConfig.label}</DropdownMenuLabel>
              {envConnections.map((connection) => (
                <DropdownMenuItem
                  key={connection.id}
                  onClick={() => {
                    if (currentConnection?.id !== connection.id) {
                      trackEvent(AnalyticsEvents.CONNECTION_SELECTED, {
                        connection_id: connection.id,
                        connection_name: connection.name,
                        connection_environment: connection.environment ?? 'development',
                      })
                    }
                    setCurrentConnection(connection)
                  }}
                  className="cursor-pointer"
                >
                  <span
                    className={cn('h-2 w-2 shrink-0 rounded-full', envConfig.dot)}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'flex-1 truncate',
                      !isUsableConnection(connection) && 'text-muted-foreground'
                    )}
                  >
                    {connection.name}
                  </span>
                  {connection.suspended ? (
                    <span className="ml-2 shrink-0 text-xs text-status-warning">
                      Paused by plan
                    </span>
                  ) : connection.enabled === false ? (
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">Disabled</span>
                  ) : null}
                  {currentConnection?.id === connection.id && (
                    <Check className="ml-2 h-3.5 w-3.5 text-foreground" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )
        })}
        {orgSlug ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer text-muted-foreground">
              <Link to="/$orgSlug/settings/connections" params={{ orgSlug }}>
                <Settings2 />
                Manage connections
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
