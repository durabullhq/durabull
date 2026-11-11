import { Link2, Mail, Plus, Send, Webhook } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SecretInput } from '@/components/secret-input'
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
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Panel, SectionHeader } from '@/components/ui/section'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type {
  AlertDestinationCreateInput,
  AlertDestinationRecord,
  AlertDestinationType,
  AlertDestinationUpdateInput,
  LinearDestinationConfig,
} from '@/hooks/use-alerts'
import {
  useAlertDestinations,
  useCreateAlertDestination,
  useDeleteAlertDestination,
  useLinearIntegration,
  useLinearMetadata,
  useTestAlertDestination,
  useUpdateAlertDestination,
} from '@/hooks/use-alerts'

const TYPE_META: Record<
  AlertDestinationType,
  { label: string; icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  webhook: {
    label: 'Webhook',
    icon: Webhook,
    description: 'Signed HTTPS deliveries to your own endpoint.',
  },
  email: {
    label: 'Email',
    icon: Mail,
    description: 'Send incident notifications to a shared inbox.',
  },
  linear: {
    label: 'Linear',
    icon: Link2,
    description: 'Create Linear issues through the org integration.',
  },
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function destinationTargetSummary(destination: AlertDestinationRecord): string {
  if (destination.type === 'webhook') return destination.url ?? '—'
  if (destination.type === 'email') {
    const target = destination.config.target
    return typeof target === 'string' ? target : '—'
  }
  return Object.keys(destination.config).length > 0 ? 'Linear (custom fields)' : 'Linear defaults'
}

export function AlertDestinationsPage() {
  const destinationsQuery = useAlertDestinations()
  const createDestination = useCreateAlertDestination()
  const updateDestination = useUpdateAlertDestination()
  const deleteDestination = useDeleteAlertDestination()
  const testDestination = useTestAlertDestination()
  const linearIntegrationQuery = useLinearIntegration()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AlertDestinationRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AlertDestinationRecord | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  const destinations = destinationsQuery.data?.destinations ?? []
  const linearConnected = linearIntegrationQuery.data?.integration?.validationStatus === 'valid'

  async function handleTest(destination: AlertDestinationRecord) {
    setTestingId(destination.id)
    try {
      const result = await testDestination.mutateAsync(destination.id)
      if (!result.success) {
        toast.error(`Test failed for ${destination.name}`, {
          description: result.error ?? `HTTP ${result.httpStatus ?? 'unknown'}`,
        })
        return
      }
      if (destination.type === 'webhook') {
        toast.success(`Test delivered to ${destination.name}`, {
          description: `HTTP ${result.httpStatus ?? 'unknown'} in ${result.durationMs ?? '?'}ms`,
        })
      } else if (destination.type === 'linear') {
        toast.success(`Linear connection verified for ${destination.name}`, {
          description: result.organizationName,
        })
      } else {
        toast.success(`Email delivery is configured for ${destination.name}`)
      }
    } catch (error) {
      toast.error(`Test failed for ${destination.name}`, {
        description: getErrorMessage(error, 'Please try again.'),
      })
    } finally {
      setTestingId(null)
    }
  }

  async function handleDeleteConfirmed(destination: AlertDestinationRecord) {
    try {
      await deleteDestination.mutateAsync(destination.id)
      toast.success('Destination deleted', {
        description: `${destination.name} was removed.`,
      })
      setDeleteTarget(null)
    } catch (error) {
      toast.error('Failed to delete destination', {
        description: getErrorMessage(error, 'Remove it from alert rules first.'),
      })
    }
  }

  return (
    <div className="max-w-4xl space-y-3">
      <SectionHeader
        title="Alert destinations"
        count={destinations.length > 0 ? destinations.length : undefined}
        description="Where incidents are sent. Shared by every connection in this organization — edit once and every rule that routes to it follows."
        actions={
          <Button type="button" size="xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add destination
          </Button>
        }
      />
      <Panel>
        {destinationsQuery.isError ? (
          <EmptyState
            size="inline"
            tone="danger"
            icon={Send}
            title="Failed to load alert destinations."
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void destinationsQuery.refetch()}
              >
                Retry
              </Button>
            }
          />
        ) : destinationsQuery.isLoading ? (
          <div className="divide-y">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-7 w-28" />
              </div>
            ))}
          </div>
        ) : destinations.length === 0 ? (
          <EmptyState
            size="inline"
            className="py-14"
            icon={Send}
            title="No destinations yet"
            description="A destination is a webhook, an email address, or Linear. Create one, then pick it on any alert rule."
            actions={
              <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Add destination
              </Button>
            }
          />
        ) : (
          <div className="divide-y">
            {destinations.map((destination) => (
              <DestinationRow
                key={destination.id}
                destination={destination}
                isTesting={testingId === destination.id}
                onTest={() => void handleTest(destination)}
                onEdit={() => setEditTarget(destination)}
                onDelete={() => setDeleteTarget(destination)}
              />
            ))}
          </div>
        )}
      </Panel>

      <CreateDestinationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        linearConnected={linearConnected}
        isSaving={createDestination.isPending}
        onCreate={async (input) => {
          try {
            await createDestination.mutateAsync(input)
            toast.success('Destination created', { description: input.name })
            setCreateOpen(false)
          } catch (error) {
            toast.error('Failed to create destination', {
              description: getErrorMessage(error, 'Please check the fields and try again.'),
            })
          }
        }}
      />

      {editTarget ? (
        <EditDestinationDialog
          key={editTarget.id}
          destination={editTarget}
          linearConnected={linearConnected}
          isSaving={updateDestination.isPending}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null)
          }}
          onSave={async (input) => {
            try {
              await updateDestination.mutateAsync({ destinationId: editTarget.id, input })
              toast.success('Destination updated', { description: editTarget.name })
              setEditTarget(null)
            } catch (error) {
              toast.error('Failed to update destination', {
                description: getErrorMessage(error, 'Please check the fields and try again.'),
              })
            }
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete destination"
        description={`Delete "${deleteTarget?.name ?? ''}"? Rules can no longer route to it, and this cannot be undone.`}
        confirmLabel="Delete"
        destructive
        isConfirming={deleteDestination.isPending}
        onConfirm={() => deleteTarget && void handleDeleteConfirmed(deleteTarget)}
      />
    </div>
  )
}

function DestinationRow({
  destination,
  isTesting,
  onTest,
  onEdit,
  onDelete,
}: {
  destination: AlertDestinationRecord
  isTesting: boolean
  onTest: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const meta = TYPE_META[destination.type]
  const Icon = meta.icon
  const inUse = destination.inUseByRuleCount > 0

  return (
    <div className="px-4 py-3" data-testid="alert-destination-row">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={meta.label} />
            <span className="text-[13px] font-semibold">{destination.name}</span>
            <Badge variant="neutral">{meta.label}</Badge>
            {destination.enabled ? null : <Badge variant="neutral">Disabled</Badge>}
            <span className="text-xs text-muted-foreground">
              {inUse
                ? `In use by ${destination.inUseByRuleCount} rule${destination.inUseByRuleCount === 1 ? '' : 's'}`
                : 'Not in use'}
            </span>
          </div>
          <div className="mt-1 truncate pl-6 font-mono text-xs text-muted-foreground">
            {destinationTargetSummary(destination)}
            {destination.type === 'webhook' && destination.secretConfigured
              ? ` · secret …${destination.secretLast4 ?? ''}`
              : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onTest}
            disabled={isTesting || !destination.enabled}
          >
            {isTesting ? 'Testing...' : 'Test'}
          </Button>
          <Button type="button" variant="outline" size="xs" onClick={onEdit}>
            Edit
          </Button>
          {inUse ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button type="button" variant="ghost" size="xs" disabled>
                      Delete
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-56">
                  Referenced by {destination.inUseByRuleCount} alert rule
                  {destination.inUseByRuleCount === 1 ? '' : 's'} — remove it from those rules
                  first.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Button type="button" variant="ghost" size="xs" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function CreateDestinationDialog({
  open,
  onOpenChange,
  linearConnected,
  isSaving,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  linearConnected: boolean
  isSaving: boolean
  onCreate: (input: AlertDestinationCreateInput) => Promise<void>
}) {
  const [type, setType] = useState<AlertDestinationType | null>(null)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [signingSecret, setSigningSecret] = useState('')
  const [emailTarget, setEmailTarget] = useState('')
  const [linearConfig, setLinearConfig] = useState<LinearDestinationConfig>({})

  const reset = () => {
    setType(null)
    setName('')
    setUrl('')
    setSigningSecret('')
    setEmailTarget('')
    setLinearConfig({})
  }

  async function handleSubmit() {
    if (!type) return
    if (type === 'webhook') {
      await onCreate({
        type: 'webhook',
        name: name.trim(),
        url: url.trim(),
        signingSecret: signingSecret.trim() || undefined,
      })
    } else if (type === 'email') {
      await onCreate({ type: 'email', name: name.trim(), config: { target: emailTarget.trim() } })
    } else {
      await onCreate({ type: 'linear', name: name.trim(), config: linearConfig })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add destination</DialogTitle>
          <DialogDescription>
            {type
              ? TYPE_META[type].description
              : 'Choose where alert incidents should be delivered.'}
          </DialogDescription>
        </DialogHeader>

        {type === null ? (
          <div className="grid gap-3">
            {(Object.keys(TYPE_META) as AlertDestinationType[]).map((candidate) => {
              const meta = TYPE_META[candidate]
              const Icon = meta.icon
              const disabled = candidate === 'linear' && !linearConnected

              return (
                <button
                  key={candidate}
                  type="button"
                  className="flex items-start gap-3 rounded-md border bg-background px-4 py-3 text-left transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setType(candidate)}
                  disabled={disabled}
                  data-testid={`destination-type-${candidate}`}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="block text-sm font-semibold">{meta.label}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {disabled
                        ? 'Connect the Linear integration under Settings → Integrations first.'
                        : meta.description}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="destination-name">Name</Label>
              <Input
                id="destination-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={
                  type === 'webhook'
                    ? 'On-call pipeline'
                    : type === 'email'
                      ? 'Ops inbox'
                      : 'Linear triage'
                }
              />
            </div>

            {type === 'webhook' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="destination-url">URL</Label>
                  <Input
                    id="destination-url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://example.com/webhooks/durabull"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination-secret">Signing secret</Label>
                  <SecretInput
                    id="destination-secret"
                    value={signingSecret}
                    onChange={(event) => setSigningSecret(event.target.value)}
                    placeholder="Optional signing secret (min 16 characters)"
                  />
                </div>
              </>
            ) : null}

            {type === 'email' ? (
              <div className="space-y-2">
                <Label htmlFor="destination-email">Recipient email</Label>
                <Input
                  id="destination-email"
                  value={emailTarget}
                  onChange={(event) => setEmailTarget(event.target.value)}
                  placeholder="oncall@example.com"
                />
              </div>
            ) : null}

            {type === 'linear' ? (
              <LinearConfigFields
                config={linearConfig}
                onChange={setLinearConfig}
                enabled={linearConnected}
              />
            ) : null}
          </div>
        )}

        <DialogFooter>
          {type !== null ? (
            <Button type="button" variant="ghost" onClick={() => setType(null)}>
              Back
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {type !== null ? (
            <Button type="button" onClick={() => void handleSubmit()} disabled={isSaving}>
              {isSaving ? 'Creating...' : 'Create destination'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditDestinationDialog({
  destination,
  linearConnected,
  isSaving,
  onOpenChange,
  onSave,
}: {
  destination: AlertDestinationRecord
  linearConnected: boolean
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: AlertDestinationUpdateInput) => Promise<void>
}) {
  const [name, setName] = useState(destination.name)
  const [url, setUrl] = useState(destination.url ?? '')
  const [signingSecret, setSigningSecret] = useState('')
  const [emailTarget, setEmailTarget] = useState(() => {
    const target = destination.config.target
    return typeof target === 'string' ? target : ''
  })
  const [linearConfig, setLinearConfig] = useState<LinearDestinationConfig>(
    () => destination.config as LinearDestinationConfig
  )
  const [enabled, setEnabled] = useState(destination.enabled)

  async function handleSubmit() {
    const input: AlertDestinationUpdateInput = { name: name.trim(), enabled }
    if (destination.type === 'webhook') {
      input.url = url.trim()
      if (signingSecret.trim()) input.signingSecret = signingSecret.trim()
    }
    if (destination.type === 'email') {
      input.config = { target: emailTarget.trim() }
    }
    if (destination.type === 'linear') {
      input.config = linearConfig as Record<string, unknown>
    }
    await onSave(input)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit destination</DialogTitle>
          <DialogDescription>
            Changes apply to every rule routing to {destination.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-destination-name">Name</Label>
            <Input
              id="edit-destination-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          {destination.type === 'webhook' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="edit-destination-url">URL</Label>
                <Input
                  id="edit-destination-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-destination-secret">Signing secret</Label>
                <SecretInput
                  id="edit-destination-secret"
                  value={signingSecret}
                  onChange={(event) => setSigningSecret(event.target.value)}
                  placeholder={
                    destination.secretConfigured
                      ? `Leave blank to keep existing (…${destination.secretLast4 ?? ''})`
                      : 'Optional signing secret (min 16 characters)'
                  }
                />
              </div>
            </>
          ) : null}

          {destination.type === 'email' ? (
            <div className="space-y-2">
              <Label htmlFor="edit-destination-email">Recipient email</Label>
              <Input
                id="edit-destination-email"
                value={emailTarget}
                onChange={(event) => setEmailTarget(event.target.value)}
              />
            </div>
          ) : null}

          {destination.type === 'linear' ? (
            <LinearConfigFields
              config={linearConfig}
              onChange={setLinearConfig}
              enabled={linearConnected}
            />
          ) : null}

          <div className="space-y-2">
            <Label>Status</Label>
            <div className="inline-flex rounded-md border bg-background">
              <button
                type="button"
                className={
                  enabled
                    ? 'bg-foreground px-4 py-2 text-sm text-background'
                    : 'px-4 py-2 text-sm text-muted-foreground hover:text-foreground'
                }
                onClick={() => setEnabled(true)}
              >
                Enabled
              </button>
              <button
                type="button"
                className={
                  !enabled
                    ? 'border-l bg-foreground px-4 py-2 text-sm text-background'
                    : 'border-l px-4 py-2 text-sm text-muted-foreground hover:text-foreground'
                }
                onClick={() => setEnabled(false)}
              >
                Disabled
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Destinations still referenced by rules cannot be disabled.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const LINEAR_PRIORITY_OPTIONS = [
  { value: '', label: 'Org default' },
  { value: '0', label: '0 — None' },
  { value: '1', label: '1 — Urgent' },
  { value: '2', label: '2 — High' },
  { value: '3', label: '3 — Medium' },
  { value: '4', label: '4 — Low' },
]

function LinearConfigFields({
  config,
  onChange,
  enabled,
}: {
  config: LinearDestinationConfig
  onChange: (config: LinearDestinationConfig) => void
  enabled: boolean
}) {
  const metadataQuery = useLinearMetadata(enabled)
  const metadata = metadataQuery.data

  if (!enabled) {
    return (
      <p className="rounded-md border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
        Connect the Linear integration to configure per-destination overrides.
      </p>
    )
  }

  if (metadataQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading Linear metadata...</p>
  }

  if (!metadata) {
    return (
      <p className="text-sm text-muted-foreground">
        Linear metadata is unavailable right now — this destination uses the organization defaults.
      </p>
    )
  }

  const states = config.teamId
    ? metadata.states.filter((state) => state.teamId === config.teamId)
    : metadata.states

  const setField = <K extends keyof LinearDestinationConfig>(
    key: K,
    value: LinearDestinationConfig[K] | undefined
  ) => {
    const next = { ...config }
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      delete next[key]
    } else {
      next[key] = value
    }
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Optional overrides — blank fields fall back to the organization integration defaults.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="linear-destination-team">Team</Label>
          <Select
            id="linear-destination-team"
            value={config.teamId ?? ''}
            onChange={(event) => {
              const next = { ...config }
              if (event.target.value) {
                next.teamId = event.target.value
              } else {
                delete next.teamId
              }
              delete next.stateId
              onChange(next)
            }}
          >
            <option value="">Org default</option>
            {metadata.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.key})
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linear-destination-project">Project</Label>
          <Select
            id="linear-destination-project"
            value={config.projectId ?? ''}
            onChange={(event) => setField('projectId', event.target.value || undefined)}
          >
            <option value="">Org default</option>
            {metadata.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linear-destination-assignee">Assignee</Label>
          <Select
            id="linear-destination-assignee"
            value={config.assigneeId ?? ''}
            onChange={(event) => setField('assigneeId', event.target.value || undefined)}
          >
            <option value="">Org default</option>
            {metadata.users.map((linearUser) => (
              <option key={linearUser.id} value={linearUser.id}>
                {linearUser.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linear-destination-state">State</Label>
          <Select
            id="linear-destination-state"
            value={config.stateId ?? ''}
            onChange={(event) => setField('stateId', event.target.value || undefined)}
          >
            <option value="">Org default</option>
            {states.map((state) => (
              <option key={state.id} value={state.id}>
                {state.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linear-destination-priority">Priority</Label>
          <Select
            id="linear-destination-priority"
            value={config.priority !== undefined ? String(config.priority) : ''}
            onChange={(event) =>
              setField(
                'priority',
                event.target.value === '' ? undefined : Number.parseInt(event.target.value, 10)
              )
            }
          >
            {LINEAR_PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linear-destination-labels">Labels</Label>
          <Select
            id="linear-destination-labels"
            value=""
            onChange={(event) => {
              const labelId = event.target.value
              const labelIds = config.labelIds ?? []
              if (!labelId || labelIds.includes(labelId)) return
              setField('labelIds', [...labelIds, labelId])
            }}
          >
            <option value="">Add a label…</option>
            {metadata.labels
              .filter((label) => !(config.labelIds ?? []).includes(label.id))
              .map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
          </Select>
          {(config.labelIds ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {metadata.labels
                .filter((label) => (config.labelIds ?? []).includes(label.id))
                .map((label) => (
                  <Badge key={label.id} variant="outline" className="gap-1">
                    {label.name}
                    <button
                      type="button"
                      className="ml-0.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() =>
                        setField(
                          'labelIds',
                          (config.labelIds ?? []).filter((id) => id !== label.id)
                        )
                      }
                      aria-label={`Remove label ${label.name}`}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
