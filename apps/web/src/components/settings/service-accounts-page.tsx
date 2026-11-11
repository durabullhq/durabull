import { isOwnerOrAdminRole } from '@durabull/utils/roles'
import { Bot, Check, Copy, KeyRound, MoreHorizontal, Plus } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  CapacityCount,
  FeaturePlanBadge,
  FeatureUpgradeNote,
  LimitReachedNote,
  PausedBadge,
} from '@/components/billing/plan-access'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SettingsPage } from '@/components/settings/settings-layout'
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
import { useAuth } from '@/hooks/use-auth'
import { useEntitlement } from '@/hooks/use-entitlement'
import { useOrganizationMembers } from '@/hooks/use-organization'
import {
  type ServiceAccount,
  type ServiceAccountExpiry,
  useCreateServiceAccount,
  useDeleteServiceAccount,
  useRotateServiceAccountToken,
  useServiceAccounts,
  useSetServiceAccountDisabled,
} from '@/hooks/use-service-accounts'
import { isPlanDenial } from '@/lib/api'
import { cn } from '@/lib/utils'

const SCOPE_LABELS: Record<string, { label: string; write: boolean }> = {
  'mcp:discover': { label: 'Discover connections and queues', write: false },
  'mcp:jobs:read': { label: 'Read jobs', write: false },
  'mcp:failures:read': { label: 'Read failures and alerts', write: false },
  'mcp:logs:read': { label: 'Read job logs', write: false },
  'mcp:diagnostics:read': { label: 'Read Redis and worker diagnostics', write: false },
  'mcp:jobs:retry': { label: 'Retry failed jobs', write: true },
  'mcp:jobs:promote': { label: 'Promote delayed jobs', write: true },
  'mcp:queues:pause': { label: 'Pause and resume queues', write: true },
  'mcp:failures:write': { label: 'Resolve and snooze alerts', write: true },
}

const DEFAULT_SCOPES = [
  'mcp:jobs:read',
  'mcp:failures:read',
  'mcp:logs:read',
  'mcp:diagnostics:read',
]

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function formatDate(value: string | null): string {
  if (!value) return 'never'
  return DATE_FORMAT.format(new Date(value))
}

/** `mcp:jobs:read` reads as `jobs:read` in a table where every scope is an MCP scope. */
function shortScope(scope: string): string {
  return scope.replace(/^mcp:/, '')
}

export function ServiceAccountsPage() {
  const { user } = useAuth()
  const { data: members } = useOrganizationMembers()
  const role = members?.find((m) => m.userId === user?.id)?.role
  const canManage = isOwnerOrAdminRole(role)
  const { data, isLoading } = useServiceAccounts()
  const entitlement = useEntitlement()
  // The plan check runs on every MCP call; show it here so an account is
  // never listed as usable while the plan blocks it.
  const planLocked = !entitlement.can('automation.service_accounts')
  const atLimit = entitlement.capacity('service_accounts.enabled').atLimit
  const [creating, setCreating] = useState(false)
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ServiceAccount | null>(null)
  const [rotateTarget, setRotateTarget] = useState<ServiceAccount | null>(null)
  const rotate = useRotateServiceAccountToken()
  const setDisabled = useSetServiceAccountDisabled()
  const remove = useDeleteServiceAccount()

  const accounts = data?.serviceAccounts ?? []
  const canCreate = canManage && !planLocked
  const createButton = canCreate ? (
    <div className="flex items-center gap-3">
      <CapacityCount limit="service_accounts.enabled" />
      <Button type="button" size="xs" disabled={atLimit} onClick={() => setCreating(true)}>
        <Plus className="h-3.5 w-3.5" aria-hidden />
        New service account
      </Button>
    </div>
  ) : null

  return (
    <SettingsPage
      wide
      title="Service accounts"
      count={isLoading ? undefined : accounts.length}
      description="MCP tokens for CI jobs and agents. Write scopes are opt-in."
      actions={accounts.length > 0 ? createButton : undefined}
      data-testid="service-accounts"
    >
      {planLocked ? (
        <div data-testid="service-accounts-plan-locked" className="space-y-1.5">
          <FeatureUpgradeNote feature="automation.service_accounts" />
          {accounts.length > 0 ? (
            <p className="px-1 text-xs text-muted-foreground">
              Existing accounts are kept, but their MCP calls are refused until the organization
              upgrades.
            </p>
          ) : null}
        </div>
      ) : canManage ? (
        <LimitReachedNote limit="service_accounts.enabled" />
      ) : null}

      {isLoading ? (
        <Panel className="divide-y">
          {[0, 1].map((row) => (
            <div key={row} className="flex h-11 items-center gap-4 px-4">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="ml-auto h-3.5 w-20" />
            </div>
          ))}
        </Panel>
      ) : accounts.length > 0 ? (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                {canManage ? (
                  <TableHead className="w-px text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <Fragment key={account.id}>
                  {/* Two rows per account: facts on top, the scope list across the full width. */}
                  <TableRow
                    data-testid="service-account-row"
                    className="border-b-0 hover:bg-transparent"
                  >
                    <TableCell className="whitespace-nowrap pb-1 pt-2.5 font-mono font-medium">
                      {account.name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap pb-1 pt-2.5">
                      {account.suspended ? (
                        <PausedBadge />
                      ) : planLocked && !account.disabled ? (
                        <Badge variant="warning">Locked by plan</Badge>
                      ) : (
                        <Badge variant={account.disabled ? 'neutral' : 'success'}>
                          {account.disabled ? 'Disabled' : 'Enabled'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap pb-1 pt-2.5 font-mono tabular-nums text-muted-foreground">
                      …{account.tokenLastFour ?? '????'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap pb-1 pt-2.5 font-mono tabular-nums text-muted-foreground">
                      {formatDate(account.tokenExpiresAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap pb-1 pt-2.5 font-mono tabular-nums text-muted-foreground">
                      {formatDate(account.createdAt)}
                    </TableCell>
                    {canManage ? (
                      <TableCell className="pb-1 pt-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={rotate.isPending}
                            onClick={() => setRotateTarget(account)}
                          >
                            Rotate token
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={`More actions for ${account.name}`}
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                disabled={setDisabled.isPending}
                                onClick={() =>
                                  setDisabled.mutate(
                                    { id: account.id, disabled: !account.disabled },
                                    {
                                      onError: (error) => {
                                        // The upgrade prompt already explains a plan denial.
                                        if (isPlanDenial(error)) return
                                        toast.error('Could not update service account', {
                                          description: errorMessage(error, ''),
                                        })
                                      },
                                    }
                                  )
                                }
                              >
                                {account.disabled ? 'Enable' : 'Disable'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-status-danger focus:text-status-danger"
                                onClick={() => setDeleteTarget(account)}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={canManage ? 6 : 5} className="pb-2.5 pt-0">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="sr-only">Scopes:</span>
                        {account.scopes.map((scope) => (
                          <Badge
                            key={scope}
                            variant={SCOPE_LABELS[scope]?.write ? 'warning' : 'outline'}
                            className="font-mono font-normal"
                            title={SCOPE_LABELS[scope]?.label ?? scope}
                          >
                            {shortScope(scope)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </Panel>
      ) : (
        <EmptyState
          icon={Bot}
          title="No service accounts"
          description={
            planLocked
              ? 'A service account gives a CI job or agent MCP access without a personal login.'
              : 'Create one when a CI job or agent needs MCP access without a personal login. Each account only gets the scopes you grant.'
          }
          actions={createButton}
        />
      )}

      {creating ? (
        <CreateServiceAccountDialog
          availableScopes={data?.availableScopes ?? Object.keys(SCOPE_LABELS)}
          onClose={() => setCreating(false)}
          onCreated={(token) => {
            setCreating(false)
            setRevealedToken(token)
          }}
        />
      ) : null}

      {revealedToken ? (
        <TokenRevealDialog token={revealedToken} onClose={() => setRevealedToken(null)} />
      ) : null}

      <ConfirmDialog
        open={rotateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRotateTarget(null)
        }}
        title="Rotate token"
        description={`Issue a new 90-day token for "${rotateTarget?.name ?? ''}"? The current token stops working immediately.`}
        confirmLabel="Rotate token"
        isConfirming={rotate.isPending}
        onConfirm={() =>
          rotateTarget &&
          rotate.mutate(
            { id: rotateTarget.id, expiresInDays: 90 },
            {
              onSuccess: ({ token }) => {
                setRotateTarget(null)
                setRevealedToken(token)
              },
              onError: (error) => {
                if (isPlanDenial(error)) return
                toast.error('Could not rotate token', {
                  description: errorMessage(error, ''),
                })
              },
            }
          )
        }
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete service account"
        description={`Delete "${deleteTarget?.name ?? ''}"? Its token stops working and this cannot be undone.`}
        confirmLabel="Delete"
        destructive
        isConfirming={remove.isPending}
        onConfirm={() =>
          deleteTarget &&
          remove.mutate(deleteTarget.id, {
            onSuccess: () => setDeleteTarget(null),
            onError: (error) =>
              toast.error('Could not delete service account', {
                description: errorMessage(error, ''),
              }),
          })
        }
      />
    </SettingsPage>
  )
}

function ScopeCheckbox({
  scope,
  checked,
  onChange,
  disabled = false,
}: {
  scope: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** The plan does not include this scope. */
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2.5 px-3 py-1.5 text-[13px]',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/60'
      )}
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 accent-foreground"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0 flex-1">{SCOPE_LABELS[scope]?.label ?? scope}</span>
      <span className="font-mono text-[11px] text-faint">{shortScope(scope)}</span>
    </label>
  )
}

function CreateServiceAccountDialog({
  availableScopes,
  onClose,
  onCreated,
}: {
  availableScopes: string[]
  onClose: () => void
  onCreated: (token: string) => void
}) {
  const create = useCreateServiceAccount()
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Set<string>>(() => new Set(DEFAULT_SCOPES))
  const [expiresInDays, setExpiresInDays] = useState<ServiceAccountExpiry>(90)
  const selectable = availableScopes.filter((scope) => scope !== 'mcp:discover')
  const readScopes = selectable.filter((scope) => !SCOPE_LABELS[scope]?.write)
  const writeScopes = selectable.filter((scope) => SCOPE_LABELS[scope]?.write)
  const canWrite = useEntitlement().can('mcp.write')
  const toggleScope = (scope: string, checked: boolean) =>
    setScopes((current) => {
      const next = new Set(current)
      if (checked) next.add(scope)
      else next.delete(scope)
      return next
    })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New service account</DialogTitle>
          <DialogDescription>
            The token is shown once. Store it in your secret manager.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate(
              { name: name.trim(), scopes: [...scopes], expiresInDays },
              { onSuccess: ({ token }) => onCreated(token) }
            )
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
            <div className="space-y-1.5">
              <Label htmlFor="service-account-name" className="text-[13px]">
                Name
              </Label>
              <Input
                id="service-account-name"
                className="font-mono"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="ci-failure-triage"
                maxLength={100}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="service-account-expiry" className="text-[13px]">
                Token expires after
              </Label>
              <Select
                id="service-account-expiry"
                value={expiresInDays}
                onChange={(event) =>
                  setExpiresInDays(Number(event.target.value) as ServiceAccountExpiry)
                }
              >
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>365 days</option>
              </Select>
            </div>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-[13px] font-medium">Scopes</legend>
            <div className="divide-y overflow-hidden rounded-md border">
              {readScopes.length > 0 ? (
                <div className="py-1">
                  <div className="eyebrow px-3 py-1">Read</div>
                  {readScopes.map((scope) => (
                    <ScopeCheckbox
                      key={scope}
                      scope={scope}
                      checked={scopes.has(scope)}
                      onChange={(checked) => toggleScope(scope, checked)}
                    />
                  ))}
                </div>
              ) : null}
              {writeScopes.length > 0 ? (
                <div className="py-1">
                  <div className="eyebrow flex items-center gap-2 px-3 py-1">
                    Write
                    <span className="normal-case tracking-normal text-status-warning">
                      changes jobs, queues and alerts
                    </span>
                    <FeaturePlanBadge feature="mcp.write" className="normal-case tracking-normal" />
                  </div>
                  {writeScopes.map((scope) => (
                    <ScopeCheckbox
                      key={scope}
                      scope={scope}
                      checked={scopes.has(scope)}
                      disabled={!canWrite}
                      onChange={(checked) => toggleScope(scope, checked)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
            <FeatureUpgradeNote feature="mcp.write" className="mt-2" />
          </fieldset>
          {create.error && !isPlanDenial(create.error) ? (
            <p className="text-[13px] text-status-danger">
              {errorMessage(create.error, 'Could not create the service account.')}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim() || scopes.size === 0}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TokenRevealDialog({ token, onClose }: { token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timeout)
  }, [copied])

  const copy = () => {
    if (!navigator.clipboard) {
      toast.error('Copying is unavailable here. Select the token and copy it manually.')
      return
    }
    navigator.clipboard.writeText(token).then(
      () => {
        setCopied(true)
        toast.success('Token copied')
      },
      () => toast.error('Could not copy. Select the token and copy it manually.')
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* A stray click outside must not throw away a token that cannot be shown again. */}
      <DialogContent onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
            Copy your token
          </DialogTitle>
          <DialogDescription>
            Use it as a Bearer token for the Durabull MCP endpoint.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-lg border border-status-warning/40">
          <p className="border-b border-status-warning/30 bg-status-warning/10 px-3 py-2 text-[13px] font-medium text-status-warning">
            This is the only time the token is shown.
          </p>
          <code
            className="block select-all break-all bg-muted/50 px-3 py-3 font-mono text-[13px] leading-5"
            data-testid="service-account-token"
          >
            {token}
          </code>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
          <Button type="button" aria-label="Copy token" onClick={copy}>
            {copied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy token'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
