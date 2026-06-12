import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import {
  AlertCircle,
  Check,
  ChevronsUpDown,
  Cloud,
  Code,
  Database,
  Loader2,
  Server,
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
import { cn } from '@/lib/utils'
import { useConnection } from './connection-provider'

// Environment configuration - matches the connections page
const environmentConfig: Record<
  ConnectionEnvironment,
  {
    label: string
    icon: typeof Code
    color: string
    bgColor: string
  }
> = {
  development: {
    label: 'Development',
    icon: Code,
    color: 'text-status-success',
    bgColor: 'bg-status-success/10',
  },
  staging: {
    label: 'Staging',
    icon: Server,
    color: 'text-status-warning',
    bgColor: 'bg-status-warning/10',
  },
  production: {
    label: 'Production',
    icon: Cloud,
    color: 'text-status-danger',
    bgColor: 'bg-status-danger/10',
  },
}

// Order for displaying environments
const environmentOrder: ConnectionEnvironment[] = ['production', 'staging', 'development']

function getEnvironmentConfig(env: ConnectionEnvironment | null) {
  return environmentConfig[env ?? 'development']
}

export function ConnectionSelector() {
  const { connections, currentConnection, setCurrentConnection, isLoading, error } = useConnection()

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-sidebar-accent/30 px-3 py-2.5">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2.5">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <span className="text-sm text-destructive">Connection error</span>
      </div>
    )
  }

  if (connections.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-status-warning/50 bg-status-warning/10 px-3 py-2.5">
        <AlertCircle className="h-4 w-4 text-status-warning" />
        <span className="text-sm text-status-warning">No connections</span>
      </div>
    )
  }

  // Get current connection's environment config
  const currentEnvConfig = currentConnection
    ? getEnvironmentConfig(currentConnection.environment)
    : null
  const CurrentEnvIcon = currentEnvConfig?.icon ?? Database

  // Group connections by environment
  const connectionsByEnv = environmentOrder.reduce(
    (acc, env) => {
      const envConnections = connections.filter((c) => c.environment === env)
      if (envConnections.length > 0) {
        acc[env] = envConnections
      }
      return acc
    },
    {} as Partial<Record<ConnectionEnvironment, typeof connections>>
  )

  // If only one connection, show it without dropdown
  if (connections.length === 1) {
    const conn = connections[0]
    const envConfig = getEnvironmentConfig(conn.environment)
    const EnvIcon = envConfig.icon

    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-sidebar-accent/30 px-3 py-2.5">
        <div className={cn('p-1 rounded', envConfig.bgColor)}>
          <EnvIcon className={cn('h-3.5 w-3.5', envConfig.color)} />
        </div>
        <span className="truncate text-sm font-medium text-sidebar-foreground">{conn.name}</span>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="connection-selector"
        className="w-full rounded-lg border border-border/50 bg-sidebar-accent/30 outline-none ring-ring transition-colors hover:bg-sidebar-accent focus-visible:ring-2 data-[state=open]:bg-sidebar-accent"
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className={cn('p-1 rounded shrink-0', currentEnvConfig?.bgColor ?? 'bg-muted')}>
            <CurrentEnvIcon
              className={cn('h-3.5 w-3.5', currentEnvConfig?.color ?? 'text-muted-foreground')}
            />
          </div>
          <span className="flex-1 truncate text-left text-sm font-medium text-sidebar-foreground">
            {currentConnection?.name ?? 'Select connection'}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start" side="bottom" sideOffset={4}>
        {environmentOrder.map((env) => {
          const envConnections = connectionsByEnv[env]
          if (!envConnections || envConnections.length === 0) return null

          const envConfig = environmentConfig[env]
          const EnvIcon = envConfig.icon

          return (
            <DropdownMenuGroup key={env}>
              <DropdownMenuLabel className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <div className={cn('p-1 rounded', envConfig.bgColor)}>
                  <EnvIcon className={cn('h-3 w-3', envConfig.color)} />
                </div>
                {envConfig.label}
              </DropdownMenuLabel>
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
                  className={cn(
                    'cursor-pointer ml-2',
                    currentConnection?.id === connection.id && 'bg-accent'
                  )}
                >
                  <Database className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{connection.name}</span>
                  {currentConnection?.id === connection.id && (
                    <Check className="ml-2 h-4 w-4 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </DropdownMenuGroup>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
