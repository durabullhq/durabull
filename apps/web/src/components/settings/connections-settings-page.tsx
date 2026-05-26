import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
  AlertCircle,
  Check,
  ChevronDown,
  Cloud,
  Code,
  Database,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Network,
  Pencil,
  Plus,
  Server,
  ShieldAlert,
  Star,
  Trash2,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { useConnection } from '@/components/connection-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppMode } from '@/hooks/use-app-mode'
import { useAuth } from '@/hooks/use-auth'
import {
  useConnectionDetail,
  useConnectionQueueDiscoveryStatus,
  useCreateConnection,
  useDeleteConnection,
  useRunConnectionQueueDiscovery,
  useSetDefaultConnection,
  useTestConnection,
  useUpdateConnection,
} from '@/hooks/use-connections'
import { useOrganizationMembers } from '@/hooks/use-organization'
import { cn } from '@/lib/utils'

type ConnectionEnvironment = 'development' | 'staging' | 'production'

interface RedisConnection {
  id: string
  name: string
  mode: 'standalone' | 'cluster'
  isDefault: boolean
  environment: ConnectionEnvironment | null
  prefix: string
}

const CONNECTION_TROUBLESHOOTING_DOCS_URL =
  'https://durabull.io/documentation/getting-started/connection-troubleshooting'

const environments: {
  value: ConnectionEnvironment
  label: string
  icon: typeof Code
  color: string
  bgColor: string
  borderColor: string
}[] = [
  {
    value: 'production',
    label: 'Production',
    icon: Cloud,
    color: 'text-status-danger',
    bgColor: 'bg-status-danger/10',
    borderColor: 'border-status-danger/30',
  },
  {
    value: 'staging',
    label: 'Staging',
    icon: Server,
    color: 'text-status-warning',
    bgColor: 'bg-status-warning/10',
    borderColor: 'border-status-warning/30',
  },
  {
    value: 'development',
    label: 'Development',
    icon: Code,
    color: 'text-status-success',
    bgColor: 'bg-status-success/10',
    borderColor: 'border-status-success/30',
  },
]

const unassignedEnvironment = {
  value: 'development' as ConnectionEnvironment,
  label: 'Unassigned',
  icon: Database,
  color: 'text-muted-foreground',
  bgColor: 'bg-muted/50',
  borderColor: 'border-border',
}

function getEnvironmentConfig(env: ConnectionEnvironment | null) {
  if (env === null) {
    return unassignedEnvironment
  }

  return environments.find((e) => e.value === env) ?? environments[0]
}

function EnvironmentSection({
  envConfig,
  connections,
  readOnly,
  canViewSecrets,
  onEdit,
  onDelete,
}: {
  envConfig: (typeof environments)[0]
  connections: RedisConnection[]
  readOnly: boolean
  canViewSecrets: boolean
  onEdit: (connection: RedisConnection) => void
  onDelete: (connection: RedisConnection) => void
}) {
  const EnvIcon = envConfig.icon

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={cn('p-2.5 rounded-xl', envConfig.bgColor)}>
          <EnvIcon className={cn('h-5 w-5', envConfig.color)} />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{envConfig.label}</h2>
          <p className="text-sm text-muted-foreground">
            {connections.length} connection{connections.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {connections.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            readOnly={readOnly}
            canViewSecrets={canViewSecrets}
            onEdit={() => onEdit(connection)}
            onDelete={() => onDelete(connection)}
          />
        ))}
      </div>
    </div>
  )
}

function EnvironmentSectionSkeleton({ envConfig }: { envConfig: (typeof environments)[0] }) {
  const EnvIcon = envConfig.icon

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={cn('p-2.5 rounded-xl', envConfig.bgColor)}>
          <EnvIcon className={cn('h-5 w-5', envConfig.color)} />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{envConfig.label}</h2>
          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="animate-pulse">
          <CardHeader className="pb-3">
            <div className="h-5 w-32 bg-muted rounded" />
            <div className="h-4 w-20 bg-muted rounded mt-2" />
          </CardHeader>
          <CardContent>
            <div className="h-4 w-full bg-muted rounded" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function ConnectionsSettingsPage({
  createFromSearch = false,
}: {
  createFromSearch?: boolean
}) {
  const { envConnections, isAuthless } = useAppMode()
  const { connections, isLoading, error } = useConnection()
  const { user } = useAuth()
  const { data: members } = useOrganizationMembers()
  const currentMembership = members?.find((m) => m.userId === user?.id)
  const canViewSecrets =
    isAuthless || currentMembership?.role === 'owner' || currentMembership?.role === 'admin'
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<RedisConnection | null>(null)
  const [deletingConnection, setDeletingConnection] = useState<RedisConnection | null>(null)
  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Database className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Connections</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">
            Manage your Redis connection configurations
          </span>
        </div>
      ),
      actions: !envConnections ? (
        <Button
          onClick={() => setCreateDialogOpen(true)}
          size="xs"
          className="gap-2"
          data-testid="add-connection-button"
        >
          <Plus className="h-4 w-4" />
          Add Connection
        </Button>
      ) : undefined,
      mobileActions: !envConnections ? (
        <DropdownMenuItem onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Connection
        </DropdownMenuItem>
      ) : undefined,
    }),
    [envConnections]
  )

  useAppTopBar(topBarConfig)

  useEffect(() => {
    trackEvent(AnalyticsEvents.CONNECTIONS_VIEWED)
  }, [])

  useEffect(() => {
    if (!createFromSearch || envConnections) return
    setCreateDialogOpen(true)
  }, [createFromSearch, envConnections])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-status-danger/10 p-4 mb-4">
          <AlertCircle className="h-8 w-8 text-status-danger" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Failed to load connections</h2>
        <p className="text-muted-foreground text-center max-w-md">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Connections"
          value={connections.length}
          icon={Database}
          loading={isLoading}
        />
        <StatCard
          title="Production"
          value={connections.filter((c) => c.environment === 'production').length}
          icon={Cloud}
          loading={isLoading}
          variant="rose"
        />
        <StatCard
          title="Development"
          value={connections.filter((c) => c.environment === 'development').length}
          icon={Code}
          loading={isLoading}
          variant="emerald"
        />
      </div>

      {/* Connections by Environment */}
      {isLoading ? (
        // Skeleton loaders
        <div className="space-y-6">
          {environments.map((env) => (
            <EnvironmentSectionSkeleton key={env.value} envConfig={env} />
          ))}
        </div>
      ) : connections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Database className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No connections configured</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              {envConnections
                ? 'No env-driven Redis connections found. Set DURABULL_REDIS_URL_* variables and restart.'
                : 'Add your first Redis connection to start managing your queues'}
            </p>
            {!envConnections && (
              <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Connection
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {environments.map((env) => {
            const envScopedConnections = connections.filter((c) => c.environment === env.value)
            if (envScopedConnections.length === 0) return null

            return (
              <EnvironmentSection
                key={env.value}
                envConfig={env}
                connections={envScopedConnections}
                readOnly={envConnections}
                canViewSecrets={canViewSecrets}
                onEdit={setEditingConnection}
                onDelete={setDeletingConnection}
              />
            )
          })}
          {(() => {
            const unassignedConnections = connections.filter((c) => c.environment === null)
            if (unassignedConnections.length === 0) return null

            return (
              <EnvironmentSection
                key="unassigned"
                envConfig={unassignedEnvironment}
                connections={unassignedConnections}
                readOnly={envConnections}
                canViewSecrets={canViewSecrets}
                onEdit={setEditingConnection}
                onDelete={setDeletingConnection}
              />
            )
          })()}
        </div>
      )}

      {!envConnections && (
        <>
          {/* Create Dialog */}
          <ConnectionFormDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            mode="create"
          />

          {/* Edit Dialog */}
          <ConnectionFormDialog
            open={!!editingConnection}
            onOpenChange={(open) => !open && setEditingConnection(null)}
            mode="edit"
            connectionId={editingConnection?.id}
          />

          <DeleteConnectionDialog
            connection={deletingConnection}
            open={!!deletingConnection}
            onOpenChange={(open) => !open && setDeletingConnection(null)}
          />
        </>
      )}
    </div>
  )
}

function ConnectionCard({
  connection,
  readOnly,
  canViewSecrets,
  onEdit,
  onDelete,
}: {
  connection: RedisConnection
  readOnly: boolean
  canViewSecrets: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const [showUrl, setShowUrl] = useState(false)
  const { data: detail, isLoading: detailLoading } = useConnectionDetail(
    showUrl && canViewSecrets ? connection.id : null
  )
  const setDefaultMutation = useSetDefaultConnection()
  const envConfig = getEnvironmentConfig(connection.environment)
  const EnvIcon = envConfig.icon

  const handleSetDefault = () => {
    if (!connection.isDefault) {
      setDefaultMutation.mutate(connection.id)
    }
  }

  const isSettingDefault = setDefaultMutation.isPending

  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all hover:shadow-md',
        connection.isDefault && 'ring-2 ring-primary/50'
      )}
      data-testid={`connection-card-${connection.id}`}
    >
      {connection.isDefault && (
        <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-2 py-1 text-xs font-medium rounded-bl-lg">
          <Star className="h-3 w-3 inline mr-1" />
          Default
        </div>
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn('p-2 rounded-lg shrink-0', envConfig.bgColor)}>
              <EnvIcon className={cn('h-4 w-4', envConfig.color)} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base truncate">{connection.name}</CardTitle>
              <div className="flex items-center gap-1 mt-1">
                <Badge
                  variant="outline"
                  className={cn('text-[10px] font-medium', envConfig.borderColor, envConfig.color)}
                >
                  {envConfig.label}
                </Badge>
                {connection.mode === 'cluster' && (
                  <Badge variant="outline" className="text-[10px] font-medium">
                    <Network className="h-2.5 w-2.5 mr-0.5" />
                    Cluster
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Connection URL</Label>
            {canViewSecrets && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={() => {
                  trackEvent(AnalyticsEvents.CONNECTION_URL_TOGGLED, {
                    visible: !showUrl,
                    connection_id: connection.id,
                  })
                  setShowUrl(!showUrl)
                }}
              >
                {showUrl ? (
                  <>
                    <EyeOff className="h-3 w-3" />
                    Hide
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" />
                    Show
                  </>
                )}
              </Button>
            )}
          </div>
          <div className="relative">
            <div
              className={cn(
                'font-mono text-xs p-2 rounded-md bg-muted/50 border overflow-hidden transition-all',
                (!showUrl || !canViewSecrets) && 'blur-sm select-none'
              )}
            >
              {!canViewSecrets ? (
                <span className="text-muted-foreground">••••••••••••••••••••••••</span>
              ) : detailLoading ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : showUrl && detail?.url ? (
                <span className="break-all">{detail.url}</span>
              ) : (
                <span className="text-muted-foreground">••••••••••••••••••••••••</span>
              )}
            </div>
          </div>
          {!canViewSecrets && (
            <p className="text-[10px] text-muted-foreground">
              Only organization admins can view connection URLs.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs gap-1.5"
            onClick={handleSetDefault}
            disabled={readOnly || connection.isDefault || isSettingDefault}
          >
            {isSettingDefault ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : connection.isDefault ? (
              <Check className="h-3 w-3 text-primary" />
            ) : (
              <Star className="h-3 w-3" />
            )}
            {connection.isDefault ? 'Default' : 'Set Default'}
          </Button>
          <div className="flex items-center gap-1">
            {!readOnly && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ConnectionFormDialog({
  open,
  onOpenChange,
  mode,
  connectionId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  connectionId?: string
}) {
  const navigate = useNavigate()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string }
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [prefix, setPrefix] = useState('bull')
  const [showUrl, setShowUrl] = useState(false)
  const [environment, setEnvironment] = useState<ConnectionEnvironment>('development')
  const [connectionMode, setConnectionMode] = useState<'standalone' | 'cluster'>('standalone')
  const [isDefault, setIsDefault] = useState(false)
  const [allowSelfSignedCerts, setAllowSelfSignedCerts] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [discoveryConnectionId, setDiscoveryConnectionId] = useState<string | null>(null)

  const { data: existingConnection, isLoading: loadingConnection } = useConnectionDetail(
    mode === 'edit' && open ? (connectionId ?? null) : null
  )
  const createMutation = useCreateConnection()
  const updateMutation = useUpdateConnection()
  const testMutation = useTestConnection()
  const runQueueDiscoveryMutation = useRunConnectionQueueDiscovery()
  const queueDiscoveryQuery = useConnectionQueueDiscoveryStatus(
    mode === 'create' && open ? discoveryConnectionId : null,
    mode === 'create' && open && !!discoveryConnectionId
  )

  const isLoading = createMutation.isPending || updateMutation.isPending
  const isTesting = testMutation.isPending
  const isDiscovering =
    mode === 'create' &&
    !!discoveryConnectionId &&
    (runQueueDiscoveryMutation.isPending ||
      queueDiscoveryQuery.isPending ||
      queueDiscoveryQuery.data?.running === true)
  const discoveryResult = queueDiscoveryQuery.data

  useEffect(() => {
    if (mode === 'edit' && existingConnection) {
      setName(existingConnection.name)
      setUrl(existingConnection.url ?? '')
      setPrefix(existingConnection.prefix ?? 'bull')
      setEnvironment(existingConnection.environment ?? 'development')
      setConnectionMode(existingConnection.mode ?? 'standalone')
      setIsDefault(existingConnection.isDefault)
      setAllowSelfSignedCerts(existingConnection.allowSelfSignedCerts ?? false)
    } else if (mode === 'create' && open) {
      setName('')
      setUrl('')
      setPrefix('bull')
      setEnvironment('development')
      setConnectionMode('standalone')
      setIsDefault(false)
      setAllowSelfSignedCerts(false)
      setDiscoveryConnectionId(null)
    }
    setTestResult(null)
  }, [mode, existingConnection, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (mode === 'create') {
        const created = await createMutation.mutateAsync({
          name,
          url,
          environment,
          isDefault,
          prefix,
          allowSelfSignedCerts,
          mode: connectionMode,
        })
        setDiscoveryConnectionId(created.connection.id)
        await runQueueDiscoveryMutation.mutateAsync(created.connection.id)
      } else if (connectionId) {
        await updateMutation.mutateAsync({
          id: connectionId,
          data: {
            name,
            url,
            environment,
            isDefault,
            prefix,
            allowSelfSignedCerts,
            mode: connectionMode,
          },
        })
        onOpenChange(false)
      }
    } catch {
      // Error is handled by mutation
    }
  }

  const handleTestConnection = async () => {
    setTestResult(null)
    try {
      const result = await testMutation.mutateAsync({
        url,
        allowSelfSignedCerts,
        mode: connectionMode,
      })
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      })
    }
  }

  const envConfig = getEnvironmentConfig(environment)
  const queueCountDiscovered = discoveryResult?.indexed.total ?? 0
  const hasDiscoveryCompleted =
    mode === 'create' &&
    !!discoveryConnectionId &&
    !!discoveryResult &&
    !discoveryResult.running &&
    !isDiscovering
  const discoveryError = runQueueDiscoveryMutation.error ?? queueDiscoveryQuery.error
  const discoveryErrorMessage =
    discoveryError instanceof Error ? discoveryError.message : 'Queue discovery failed'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            {mode === 'create' ? 'Add Connection' : 'Edit Connection'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a new Redis connection to your workspace'
              : 'Update the connection configuration'}
          </DialogDescription>
        </DialogHeader>

        {loadingConnection && mode === 'edit' ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : mode === 'create' && discoveryConnectionId ? (
          <div className="space-y-4 py-3">
            {isDiscovering ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <div className="space-y-1">
                  <p className="font-medium">Discovering queues...</p>
                  <p className="text-sm text-muted-foreground">
                    We are scanning Redis and indexing queue names for fast loading.
                  </p>
                </div>
              </div>
            ) : (
              hasDiscoveryCompleted && (
                <div className="space-y-4">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <h4 className="font-medium">Initial discovery complete</h4>
                    {queueCountDiscovered > 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Found {queueCountDiscovered} queue{queueCountDiscovered === 1 ? '' : 's'}.
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        No queues were discovered yet for this connection.
                      </p>
                    )}
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      Close
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        if (!orgSlug || !discoveryConnectionId) return
                        void navigate({
                          to: '/$orgSlug/c/$connectionId',
                          params: { orgSlug, connectionId: discoveryConnectionId },
                        })
                        onOpenChange(false)
                      }}
                    >
                      View Queues
                    </Button>
                  </DialogFooter>
                </div>
              )
            )}

            {!isDiscovering && !hasDiscoveryCompleted && discoveryConnectionId && (
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={() => runQueueDiscoveryMutation.mutate(discoveryConnectionId)}
                >
                  Retry Discovery
                </Button>
              </DialogFooter>
            )}

            {discoveryError && (
              <div className="flex items-center gap-2 text-sm rounded-md bg-destructive/10 px-3 py-2 text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{discoveryErrorMessage}</span>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Connection Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Production Redis"
                required
              />
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label htmlFor="url">Connection URL</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="url"
                    type={showUrl ? 'text' : 'password'}
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value)
                      setTestResult(null)
                    }}
                    placeholder="redis://..."
                    required
                    className="font-mono text-sm pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUrl((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showUrl ? 'Hide connection URL' : 'Show connection URL'}
                  >
                    {showUrl ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={!url || isTesting}
                  className="shrink-0 gap-1.5"
                >
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Test
                </Button>
              </div>
              {testResult && (
                <div
                  className={cn(
                    'flex items-center gap-2 text-sm p-2 rounded-md',
                    testResult.success
                      ? 'bg-status-success/10 text-status-success'
                      : 'bg-status-danger/10 text-status-danger'
                  )}
                >
                  {testResult.success ? (
                    <Wifi className="h-4 w-4 shrink-0" />
                  ) : (
                    <WifiOff className="h-4 w-4 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
              {mode === 'create' && (
                <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs">
                  <a
                    href={CONNECTION_TROUBLESHOOTING_DOCS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Info className="h-3.5 w-3.5 mr-1.5" />
                    Having trouble connecting? Read connection troubleshooting
                  </a>
                </Button>
              )}
            </div>

            {/* Connection Mode */}
            <div className="space-y-2">
              <Label>Connection Mode</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={connectionMode === 'standalone' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setConnectionMode('standalone')}
                  className="gap-1.5"
                >
                  <Server className="h-3.5 w-3.5" />
                  Standalone
                </Button>
                <Button
                  type="button"
                  variant={connectionMode === 'cluster' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setConnectionMode('cluster')}
                  className="gap-1.5"
                >
                  <Network className="h-3.5 w-3.5" />
                  Cluster
                </Button>
              </div>
              {connectionMode === 'cluster' && (
                <p className="text-xs text-muted-foreground">
                  For Redis Cluster deployments (e.g., AWS ElastiCache, Upstash). Provide the
                  cluster endpoint URL.
                </p>
              )}
            </div>

            {/* Prefix */}
            <div className="space-y-2">
              <Label htmlFor="prefix">BullMQ Prefix</Label>
              <Input
                id="prefix"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="bull"
                required
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use the same prefix configured by your BullMQ producers and workers.
              </p>
            </div>

            {/* Environment */}
            <div className="space-y-2">
              <Label>Environment</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn('w-full justify-between', envConfig.borderColor)}
                  >
                    <div className="flex items-center gap-2">
                      <envConfig.icon className={cn('h-4 w-4', envConfig.color)} />
                      <span>{envConfig.label}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                  {environments.map((env) => (
                    <DropdownMenuItem
                      key={env.value}
                      onClick={() => setEnvironment(env.value)}
                      className="cursor-pointer"
                    >
                      <env.icon className={cn('mr-2 h-4 w-4', env.color)} />
                      {env.label}
                      {environment === env.value && (
                        <Check className="ml-auto h-4 w-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Default toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Allow self-signed TLS certificates</Label>
                <p className="text-xs text-muted-foreground">
                  Enable for providers like Heroku Key-Value Store that use self-signed TLS certs
                </p>
              </div>
              <Button
                type="button"
                variant={allowSelfSignedCerts ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setAllowSelfSignedCerts(!allowSelfSignedCerts)
                  setTestResult(null)
                }}
                className="gap-1.5"
              >
                <ShieldAlert
                  className={cn('h-3.5 w-3.5', allowSelfSignedCerts && 'fill-current')}
                />
                {allowSelfSignedCerts ? 'Enabled' : 'Disabled'}
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Set as default</Label>
                <p className="text-xs text-muted-foreground">
                  This connection will be used by default
                </p>
              </div>
              <Button
                type="button"
                variant={isDefault ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsDefault(!isDefault)}
                className="gap-1.5"
              >
                <Star className={cn('h-3.5 w-3.5', isDefault && 'fill-current')} />
                {isDefault ? 'Default' : 'Make Default'}
              </Button>
            </div>

            {/* Error display */}
            {(createMutation.error || updateMutation.error) && (
              <div className="flex items-center gap-2 text-sm p-3 rounded-md bg-destructive/10 text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{createMutation.error?.message || updateMutation.error?.message}</span>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !name || !url || !prefix.trim()}
                data-testid="connection-form-submit"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {mode === 'create' ? 'Creating...' : 'Saving...'}
                  </>
                ) : mode === 'create' ? (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Connection
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DeleteConnectionDialog({
  connection,
  open,
  onOpenChange,
}: {
  connection: RedisConnection | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [confirmName, setConfirmName] = useState('')
  const deleteMutation = useDeleteConnection()

  const isConfirmed = connection && confirmName === connection.name
  const isDeleting = deleteMutation.isPending

  useEffect(() => {
    if (!open) {
      setConfirmName('')
    }
  }, [open])

  const handleDelete = async () => {
    if (!connection || !isConfirmed) return

    try {
      await deleteMutation.mutateAsync(connection.id)
      onOpenChange(false)
    } catch {
      // Error handled by mutation
    }
  }

  if (!connection) return null

  const envConfig = getEnvironmentConfig(connection.environment)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Delete Connection
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the connection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Connection info */}
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', envConfig.bgColor)}>
                <envConfig.icon className={cn('h-4 w-4', envConfig.color)} />
              </div>
              <div>
                <p className="font-medium">{connection.name}</p>
                <Badge
                  variant="outline"
                  className={cn('mt-1 text-[10px]', envConfig.borderColor, envConfig.color)}
                >
                  {envConfig.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Warning for default connection */}
          {connection.isDefault && (
            <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-status-warning/10 text-status-warning">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                This is the default connection. If other connections remain, one of them will be
                selected as the new default.
              </span>
            </div>
          )}

          {/* Confirmation input */}
          <div className="space-y-2">
            <Label htmlFor="confirm-name">
              Type{' '}
              <span className="font-mono font-semibold bg-muted px-1.5 py-0.5 rounded">
                {connection.name}
              </span>{' '}
              to confirm:
            </Label>
            <Input
              id="confirm-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder="Enter connection name"
              className={confirmName && !isConfirmed ? 'border-destructive' : ''}
              autoComplete="off"
            />
            {confirmName && !isConfirmed && (
              <p className="text-sm text-destructive">Name does not match</p>
            )}
          </div>

          {deleteMutation.error && (
            <div className="flex items-center gap-2 text-sm p-3 rounded-md bg-destructive/10 text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{deleteMutation.error.message}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmed || isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Connection
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type StatVariant = 'default' | 'emerald' | 'amber' | 'rose' | 'indigo'

interface StatCardProps {
  title: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  loading?: boolean
  variant?: StatVariant
}

const variantStyles: Record<
  StatVariant,
  {
    icon: string
    accent: string
  }
> = {
  default: {
    icon: 'text-muted-foreground',
    accent: 'bg-status-neutral/40',
  },
  indigo: {
    icon: 'text-status-priority',
    accent: 'bg-status-priority',
  },
  emerald: {
    icon: 'text-status-success',
    accent: 'bg-status-success',
  },
  amber: {
    icon: 'text-status-warning',
    accent: 'bg-status-warning',
  },
  rose: {
    icon: 'text-status-danger',
    accent: 'bg-status-danger',
  },
}

function StatCard({ title, value, icon: Icon, loading, variant = 'default' }: StatCardProps) {
  const styles = variantStyles[variant]

  return (
    <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
      <span className={cn('absolute inset-x-0 top-0 h-0.5', styles.accent)} aria-hidden="true" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="eyebrow">{title}</CardTitle>
        <Icon className={cn('h-4 w-4', styles.icon)} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-12 bg-muted rounded animate-pulse" />
        ) : (
          <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
