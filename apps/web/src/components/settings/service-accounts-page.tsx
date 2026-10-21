import { Link } from '@tanstack/react-router'
import { Bot, Copy, Lock, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { useBilling } from '@/hooks/use-billing'
import { useActiveOrganization, useOrganizationMembers } from '@/hooks/use-organization'
import {
  type ServiceAccount,
  type ServiceAccountExpiry,
  useCreateServiceAccount,
  useDeleteServiceAccount,
  useRotateServiceAccountToken,
  useServiceAccounts,
  useSetServiceAccountDisabled,
} from '@/hooks/use-service-accounts'

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

export function ServiceAccountsPage() {
  const { user } = useAuth()
  const { data: members } = useOrganizationMembers()
  const role = members?.find((m) => m.userId === user?.id)?.role
  const canManage = role === 'owner' || role === 'admin'
  const { data, isLoading } = useServiceAccounts()
  const { data: billing } = useBilling()
  const { data: activeOrganization } = useActiveOrganization()
  // The plan check runs on every MCP call; show it here so an account is
  // never listed as usable while the plan blocks it.
  const planLocked = Boolean(
    billing?.enabled &&
      billing.enforced &&
      !billing.features.includes('automation.service_accounts')
  )
  const [creating, setCreating] = useState(false)
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ServiceAccount | null>(null)
  const rotate = useRotateServiceAccountToken()
  const setDisabled = useSetServiceAccountDisabled()
  const remove = useDeleteServiceAccount()

  return (
    <div className="max-w-4xl space-y-6" data-testid="service-accounts">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b bg-muted/30">
          <div className="space-y-1">
            <CardTitle className="text-base">Service accounts</CardTitle>
            <CardDescription>
              Persistent MCP identities for unattended automation. Each account is limited to the
              scopes you grant here; write scopes are always opt-in.
            </CardDescription>
          </div>
          {canManage && !planLocked ? (
            <Button type="button" size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New service account
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          {planLocked ? (
            <div
              className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
              data-testid="service-accounts-plan-locked"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <div className="font-medium">Service accounts need the Team plan</div>
                <p className="text-muted-foreground">
                  Existing accounts are kept, but their MCP calls are refused until the organization
                  upgrades.{' '}
                  {activeOrganization?.slug ? (
                    <Link
                      to="/$orgSlug/settings/billing"
                      params={{ orgSlug: activeOrganization.slug }}
                      className="text-primary underline"
                    >
                      See plans
                    </Link>
                  ) : null}
                </p>
              </div>
            </div>
          ) : null}
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : data && data.serviceAccounts.length > 0 ? (
            data.serviceAccounts.map((account) => (
              <div
                key={account.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4"
                data-testid="service-account-row"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{account.name}</span>
                    {account.suspended ? (
                      <Badge variant="warning">Paused by plan limit</Badge>
                    ) : planLocked && !account.disabled ? (
                      <Badge variant="warning">Locked by plan</Badge>
                    ) : (
                      <Badge variant={account.disabled ? 'secondary' : 'success'}>
                        {account.disabled ? 'Disabled' : 'Enabled'}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Token …{account.tokenLastFour ?? '????'} · expires{' '}
                    {formatDate(account.tokenExpiresAt)}
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {account.scopes.map((scope) => (
                      <Badge
                        key={scope}
                        variant={SCOPE_LABELS[scope]?.write ? 'warning' : 'outline'}
                      >
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={rotate.isPending}
                      onClick={() =>
                        rotate.mutate(
                          { id: account.id, expiresInDays: 90 },
                          {
                            onSuccess: ({ token }) => setRevealedToken(token),
                            onError: (error) =>
                              toast.error('Could not rotate token', {
                                description: errorMessage(error, ''),
                              }),
                          }
                        )
                      }
                    >
                      Rotate token
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={setDisabled.isPending}
                      onClick={() =>
                        setDisabled.mutate(
                          { id: account.id, disabled: !account.disabled },
                          {
                            onError: (error) =>
                              toast.error('Could not update service account', {
                                description: errorMessage(error, ''),
                              }),
                          }
                        )
                      }
                    >
                      {account.disabled ? 'Enable' : 'Disable'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setDeleteTarget(account)}
                    >
                      Delete
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No service accounts yet. Use one when a CI job or agent needs MCP access without a
              personal login.
            </p>
          )}
        </CardContent>
      </Card>

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
    </div>
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
          <div className="space-y-1.5">
            <Label htmlFor="service-account-name">Name</Label>
            <Input
              id="service-account-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="ci-failure-triage"
              maxLength={100}
              required
            />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Scopes</legend>
            {selectable.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={scopes.has(scope)}
                  onChange={(event) =>
                    setScopes((current) => {
                      const next = new Set(current)
                      if (event.target.checked) next.add(scope)
                      else next.delete(scope)
                      return next
                    })
                  }
                />
                <span>{SCOPE_LABELS[scope]?.label ?? scope}</span>
                {SCOPE_LABELS[scope]?.write ? <Badge variant="warning">Write</Badge> : null}
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="service-account-expiry">Token expires after</Label>
            <select
              id="service-account-expiry"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={expiresInDays}
              onChange={(event) =>
                setExpiresInDays(Number(event.target.value) as ServiceAccountExpiry)
              }
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>365 days</option>
            </select>
          </div>
          {create.error ? (
            <p className="text-sm text-destructive">
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
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy your token</DialogTitle>
          <DialogDescription>
            This is the only time the token is shown. Use it as a Bearer token for the Durabull MCP
            endpoint.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 text-xs">
            {token}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Copy token"
            onClick={() => {
              if (!navigator.clipboard) {
                toast.error('Copying is unavailable here. Select the token and copy it manually.')
                return
              }
              navigator.clipboard.writeText(token).then(
                () => toast.success('Token copied'),
                () => toast.error('Could not copy. Select the token and copy it manually.')
              )
            }}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
