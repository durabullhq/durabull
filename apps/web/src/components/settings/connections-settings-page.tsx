import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
  CircleAlert,
  CircleCheck,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Plus,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useConnection } from '@/components/connection-provider'
import { CopyButton, SettingsPage, useSettingsTopBar } from '@/components/settings/settings-layout'
import { StatusIndicator } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Panel } from '@/components/ui/section'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  isDefault: boolean
  environment: ConnectionEnvironment | null
  prefix: string
  enabled?: boolean
  /** Paused by the organization's plan connection limit. */
  suspended?: boolean
}

const CONNECTION_TROUBLESHOOTING_DOCS_URL =
  'https://durabull.io/documentation/getting-started/connection-troubleshooting'

/** Listed production first: the order rows are sorted in and the order of the summary. */
const environments: {
  value: ConnectionEnvironment
  label: string
  dot: string
  badge: 'destructive' | 'warning' | 'success'
}[] = [
  { value: 'production', label: 'Production', dot: 'bg-status-danger', badge: 'destructive' },
  { value: 'staging', label: 'Staging', dot: 'bg-status-warning', badge: 'warning' },
  { value: 'development', label: 'Development', dot: 'bg-status-success', badge: 'success' },
]

const unassignedEnvironment = {
  label: 'Unassigned',
  dot: 'bg-status-neutral',
  badge: 'neutral',
} as const

function getEnvironmentConfig(env: ConnectionEnvironment | null) {
  return environments.find((e) => e.value === env) ?? unassignedEnvironment
}

function environmentRank(env: ConnectionEnvironment | null) {
  const index = environments.findIndex((e) => e.value === env)
  return index === -1 ? environments.length : index
}

const MASKED_URL = 'redis://••••••••••••'

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
  const mobileActions = useMemo(
    () =>
      !envConnections ? (
        <DropdownMenuItem onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add connection
        </DropdownMenuItem>
      ) : undefined,
    [envConnections]
  )

  useSettingsTopBar('Connections', { mobileActions })

  useEffect(() => {
    trackEvent(AnalyticsEvents.CONNECTIONS_VIEWED)
  }, [])

  useEffect(() => {
    if (!createFromSearch || envConnections) return
    setCreateDialogOpen(true)
  }, [createFromSearch, envConnections])

  // Production first, then by name, so the riskiest rows are always at the top.
  const sortedConnections = useMemo(
    () =>
      [...connections].sort(
        (a, b) =>
          environmentRank(a.environment) - environmentRank(b.environment) ||
          a.name.localeCompare(b.name)
      ),
    [connections]
  )

  if (error) {
    return (
      <EmptyState
        icon={CircleAlert}
        tone="danger"
        title="Failed to load connections"
        description={error.message}
        className="max-w-6xl"
      />
    )
  }

  const environmentSummary = [
    ...environments.map((env) => ({
      label: env.label.toLowerCase(),
      count: connections.filter((c) => c.environment === env.value).length,
    })),
    {
      label: 'unassigned',
      count: connections.filter((c) => c.environment === null).length,
    },
  ]
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.label}`)
    .join(' · ')

  const addButton = !envConnections ? (
    <Button onClick={() => setCreateDialogOpen(true)} size="xs" data-testid="add-connection-button">
      <Plus className="h-3.5 w-3.5" aria-hidden />
      Add connection
    </Button>
  ) : null
  const hasConnections = connections.length > 0

  return (
    <SettingsPage
      wide
      title="Redis connections"
      count={isLoading ? undefined : connections.length}
      description={
        envConnections
          ? 'Set by DURABULL_REDIS_URL_* environment variables. Restart to apply changes.'
          : environmentSummary || undefined
      }
      actions={isLoading || hasConnections ? addButton : undefined}
    >
      {isLoading ? (
        <Panel className="divide-y">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex h-11 items-center gap-4 px-4">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="ml-auto h-3.5 w-32" />
            </div>
          ))}
        </Panel>
      ) : !hasConnections ? (
        <EmptyState
          icon={Database}
          title="No connections configured"
          description={
            envConnections
              ? 'No Redis connections were found in the environment. Set DURABULL_REDIS_URL_* variables and restart.'
              : 'Add a Redis connection to see its BullMQ queues, jobs and workers.'
          }
          actions={addButton}
        />
      ) : (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Status</TableHead>
                {!envConnections ? (
                  <TableHead className="w-px">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedConnections.map((connection) => (
                <ConnectionRow
                  key={connection.id}
                  connection={connection}
                  readOnly={envConnections}
                  canViewSecrets={canViewSecrets}
                  onEdit={() => setEditingConnection(connection)}
                  onDelete={() => setDeletingConnection(connection)}
                />
              ))}
            </TableBody>
          </Table>
        </Panel>
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
    </SettingsPage>
  )
}

function ConnectionRow({
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
  const updateMutation = useUpdateConnection()
  const envConfig = getEnvironmentConfig(connection.environment)
  const enabled = connection.enabled !== false
  const suspended = connection.suspended === true
  const revealedUrl = showUrl && canViewSecrets ? detail?.url : undefined

  return (
    <TableRow data-testid={`connection-card-${connection.id}`}>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', envConfig.dot)} aria-hidden />
          <span className="truncate font-medium">{connection.name}</span>
          {connection.isDefault ? <Badge variant="neutral">Default</Badge> : null}
        </div>
      </TableCell>

      <TableCell>
        <Badge variant={envConfig.badge}>{envConfig.label}</Badge>
      </TableCell>

      <TableCell>
        <div className="flex min-w-44 max-w-md items-center gap-1">
          <span
            className={cn(
              'min-w-0 font-mono text-xs',
              revealedUrl ? 'break-all' : 'select-none truncate text-faint'
            )}
            title={
              canViewSecrets ? undefined : 'Only organization admins can view connection URLs.'
            }
          >
            {detailLoading ? 'Loading…' : (revealedUrl ?? MASKED_URL)}
          </span>
          {canViewSecrets ? (
            <button
              type="button"
              onClick={() => {
                trackEvent(AnalyticsEvents.CONNECTION_URL_TOGGLED, {
                  visible: !showUrl,
                  connection_id: connection.id,
                })
                setShowUrl(!showUrl)
              }}
              aria-label={
                showUrl
                  ? `Hide connection URL for ${connection.name}`
                  : `Show connection URL for ${connection.name}`
              }
              aria-pressed={showUrl}
              title={showUrl ? 'Hide URL' : 'Show URL'}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {showUrl ? (
                <EyeOff className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          ) : null}
          {revealedUrl ? <CopyButton value={revealedUrl} label="connection URL" /> : null}
        </div>
      </TableCell>

      <TableCell className="font-mono text-xs text-muted-foreground">{connection.prefix}</TableCell>

      <TableCell className="whitespace-nowrap">
        {suspended ? (
          <Badge variant="warning">Paused by plan limit</Badge>
        ) : (
          <StatusIndicator status={enabled ? 'enabled' : 'disabled'} showPulse={false} />
        )}
      </TableCell>

      {!readOnly ? (
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            <Button variant="outline" size="xs" onClick={onEdit}>
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`More actions for ${connection.name}`}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={connection.isDefault || setDefaultMutation.isPending}
                  onClick={() => {
                    if (!connection.isDefault) setDefaultMutation.mutate(connection.id)
                  }}
                >
                  {connection.isDefault ? 'Default connection' : 'Set as default'}
                </DropdownMenuItem>
                {/* Disabled connections stop polling and alert evaluation and
                    do not count toward the plan's connection limit. */}
                <DropdownMenuItem
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({ id: connection.id, data: { enabled: !enabled } })
                  }
                >
                  {enabled ? 'Disable' : 'Enable'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-status-danger focus:text-status-danger"
                  onClick={onDelete}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  )
}

function FormError({ message }: { message: string | undefined }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md bg-status-danger/10 px-3 py-2 text-[13px] text-status-danger"
    >
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
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
      setIsDefault(existingConnection.isDefault)
      setAllowSelfSignedCerts(existingConnection.allowSelfSignedCerts ?? false)
    } else if (mode === 'create' && open) {
      setName('')
      setUrl('')
      setPrefix('bull')
      setEnvironment('development')
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
      const result = await testMutation.mutateAsync({ url, allowSelfSignedCerts })
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      })
    }
  }

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
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add connection' : 'Edit connection'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Durabull reads BullMQ queues from this Redis instance.'
              : 'Changes apply to everyone in this workspace.'}
          </DialogDescription>
        </DialogHeader>

        {loadingConnection && mode === 'edit' ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : mode === 'create' && discoveryConnectionId ? (
          <div className="space-y-4">
            {isDiscovering ? (
              <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-3">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                <div>
                  <p className="text-[13px] font-medium">Discovering queues...</p>
                  <p className="text-xs text-muted-foreground">
                    Scanning Redis and indexing queue names for fast loading.
                  </p>
                </div>
              </div>
            ) : (
              hasDiscoveryCompleted && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-3">
                    <CircleCheck className="h-4 w-4 shrink-0 text-status-success" aria-hidden />
                    <div>
                      <h4 className="text-[13px] font-medium">Initial discovery complete</h4>
                      {queueCountDiscovered > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Found {queueCountDiscovered} queue{queueCountDiscovered === 1 ? '' : 's'}.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No queues were discovered yet for this connection.
                        </p>
                      )}
                    </div>
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
                      View queues
                    </Button>
                  </DialogFooter>
                </div>
              )
            )}

            {discoveryError ? <FormError message={discoveryErrorMessage} /> : null}

            {!isDiscovering && !hasDiscoveryCompleted && discoveryConnectionId && (
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={() => runQueueDiscoveryMutation.mutate(discoveryConnectionId)}
                >
                  Retry discovery
                </Button>
              </DialogFooter>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-[13px]">
                  Name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Production Redis"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="environment" className="text-[13px]">
                  Environment
                </Label>
                <Select
                  id="environment"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value as ConnectionEnvironment)}
                >
                  {environments.map((env) => (
                    <option key={env.value} value={env.value}>
                      {env.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <fieldset className="grid gap-3 border-y py-4">
              <legend className="sr-only">Redis</legend>
              <div className="space-y-1.5">
                <Label htmlFor="url" className="text-[13px]">
                  Connection URL
                </Label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
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
                      autoComplete="off"
                      className="pr-9 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowUrl((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
                      aria-label={showUrl ? 'Hide connection URL' : 'Show connection URL'}
                    >
                      {showUrl ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={!url || isTesting}
                    className="shrink-0"
                  >
                    {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Test
                  </Button>
                </div>
                {testResult ? (
                  <p
                    aria-live="polite"
                    className={cn(
                      'flex items-start gap-2 text-xs',
                      testResult.success ? 'text-status-success' : 'text-status-danger'
                    )}
                  >
                    {testResult.success ? (
                      <CircleCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                    ) : (
                      <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                    <span>{testResult.message}</span>
                  </p>
                ) : mode === 'create' ? (
                  <p className="text-xs text-muted-foreground">
                    Having trouble connecting?{' '}
                    <a
                      href={CONNECTION_TROUBLESHOOTING_DOCS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
                    >
                      Read connection troubleshooting
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prefix" className="text-[13px]">
                  BullMQ prefix
                </Label>
                <Input
                  id="prefix"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="bull"
                  required
                  className="max-w-48 font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  The prefix your BullMQ producers and workers use.
                </p>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-foreground"
                  checked={allowSelfSignedCerts}
                  onChange={(e) => {
                    setAllowSelfSignedCerts(e.target.checked)
                    setTestResult(null)
                  }}
                />
                <span>
                  <span className="block text-[13px] font-medium leading-4">
                    Allow self-signed TLS certificates
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    For providers such as Heroku Key-Value Store that use self-signed certificates.
                  </span>
                </span>
              </label>
            </fieldset>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-foreground"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              <span>
                <span className="block text-[13px] font-medium leading-4">Make default</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Durabull opens on the default connection.
                </span>
              </span>
            </label>

            <FormError message={createMutation.error?.message || updateMutation.error?.message} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !name || !url || !prefix.trim()}
                data-testid="connection-form-submit"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isLoading
                  ? mode === 'create'
                    ? 'Creating...'
                    : 'Saving...'
                  : mode === 'create'
                    ? 'Create connection'
                    : 'Save changes'}
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
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Delete connection</DialogTitle>
          <DialogDescription>
            Permanently removes this connection from Durabull. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2.5 rounded-md border bg-muted/40 px-3 py-2">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', envConfig.dot)} aria-hidden />
            <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{connection.name}</p>
            <Badge variant={envConfig.badge}>{envConfig.label}</Badge>
          </div>

          {connection.isDefault && (
            <p className="flex items-start gap-2 rounded-md bg-status-warning/10 px-3 py-2 text-[13px] text-status-warning">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                This is the default connection. If other connections remain, one of them will be
                selected as the new default.
              </span>
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="confirm-name" className="text-[13px] leading-5">
              Type{' '}
              <span className="rounded-[4px] border bg-muted px-1 py-px font-mono text-xs">
                {connection.name}
              </span>{' '}
              to confirm
            </Label>
            <Input
              id="confirm-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder="Connection name"
              aria-invalid={Boolean(confirmName && !isConfirmed)}
              className={confirmName && !isConfirmed ? 'border-status-danger' : ''}
              autoComplete="off"
            />
            {confirmName && !isConfirmed && (
              <p className="text-xs text-status-danger">Name does not match</p>
            )}
          </div>

          <FormError message={deleteMutation.error?.message} />
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
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isDeleting ? 'Deleting...' : 'Delete connection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
