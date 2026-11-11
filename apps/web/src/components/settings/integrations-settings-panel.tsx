import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FeatureUpgradeNote } from '@/components/billing/plan-access'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SettingsPage } from '@/components/settings/settings-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Panel } from '@/components/ui/section'
import {
  useConnectLinearIntegration,
  useDeleteLinearIntegration,
  useLinearIntegration,
  useSaveLinearIntegration,
  useTestLinearIntegration,
} from '@/hooks/use-alerts'
import { useEntitlement } from '@/hooks/use-entitlement'
import { isPlanDenial } from '@/lib/api'

export function IntegrationsSettingsPanel({ orgSlug }: { orgSlug: string }) {
  const linearIntegrationQuery = useLinearIntegration()
  const connectLinearIntegration = useConnectLinearIntegration()
  const saveLinearIntegration = useSaveLinearIntegration()
  const deleteLinearIntegration = useDeleteLinearIntegration()
  const testLinearIntegration = useTestLinearIntegration()
  const [linearTeamId, setLinearTeamId] = useState('')
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const linearIntegration = linearIntegrationQuery.data?.integration ?? null
  const linearAllowed = useEntitlement().can('alerts.linear')

  useEffect(() => {
    setLinearTeamId(linearIntegration?.defaultTeamId ?? '')
  }, [linearIntegration?.defaultTeamId])

  const linearState = !linearIntegration
    ? ({ label: 'Not connected', variant: 'neutral' } as const)
    : linearIntegration.validationStatus === 'valid'
      ? ({ label: 'Connected', variant: 'success' } as const)
      : ({ label: 'Needs attention', variant: 'warning' } as const)

  return (
    <SettingsPage title="Integrations" count={linearIntegration ? '1 connected' : undefined}>
      <Panel>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold">Linear</h3>
              <Badge variant={linearState.variant}>{linearState.label}</Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {linearIntegration?.linearOrganizationName ? (
                <>
                  {linearIntegration.linearOrganizationName}
                  {linearIntegration.scopes ? (
                    <span className="ml-1.5 font-mono">{linearIntegration.scopes}</span>
                  ) : null}
                </>
              ) : (
                'Open a Linear issue when an alert fires.'
              )}
            </p>
          </div>
          {!linearIntegration ? (
            <Button
              type="button"
              size="xs"
              onClick={async () => {
                try {
                  const result = await connectLinearIntegration.mutateAsync()
                  window.location.assign(result.authorizationUrl)
                } catch (error) {
                  if (isPlanDenial(error)) return
                  console.error('Failed to start Linear OAuth:', error)
                  toast.error('Failed to start Linear connection', {
                    description: getErrorMessage(
                      error,
                      'Check the Linear OAuth configuration and try again.'
                    ),
                  })
                }
              }}
              disabled={connectLinearIntegration.isPending || !linearAllowed}
            >
              {connectLinearIntegration.isPending ? 'Connecting…' : 'Connect Linear'}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={async () => {
                  try {
                    const result = await testLinearIntegration.mutateAsync()
                    toast.success('Linear connection verified', {
                      description: result.organizationName,
                    })
                  } catch (error) {
                    console.error('Failed to test Linear connection:', error)
                    toast.error('Failed to test Linear connection', {
                      description: getErrorMessage(error, 'Please try again.'),
                    })
                  }
                }}
                disabled={testLinearIntegration.isPending}
              >
                {testLinearIntegration.isPending ? 'Testing…' : 'Test connection'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="text-status-danger hover:text-status-danger"
                onClick={() => setConfirmingRemove(true)}
                disabled={deleteLinearIntegration.isPending}
              >
                Remove
              </Button>
            </div>
          )}
        </div>
        {linearIntegration ? null : (
          <FeatureUpgradeNote feature="alerts.linear" className="mx-4 mb-3" />
        )}

        {linearIntegration ? (
          <form
            className="border-t"
            onSubmit={async (event) => {
              event.preventDefault()
              try {
                await saveLinearIntegration.mutateAsync({
                  defaultTeamId: linearTeamId.trim() || null,
                })
                toast.success('Linear defaults saved')
              } catch (error) {
                console.error('Failed to save Linear defaults:', error)
                toast.error('Failed to save Linear defaults', {
                  description: getErrorMessage(error, 'Please try again.'),
                })
              }
            }}
          >
            <div className="space-y-1.5 px-4 py-3">
              <Label htmlFor="linear-default-team" className="text-[13px]">
                Default team
              </Label>
              <Input
                id="linear-default-team"
                className="max-w-sm"
                value={linearTeamId}
                onChange={(event) => setLinearTeamId(event.target.value)}
                placeholder="Name, key, or ID"
                aria-label="Default Linear team (name, key, or ID)"
              />
              <p className="text-xs text-muted-foreground">
                A team name, key (for example INTAKE) or ID. Used when an alert rule does not set
                its own team.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/40 px-4 py-2">
              <p className="text-xs text-muted-foreground">
                OAuth tokens are encrypted at rest and never returned by the API.
              </p>
              <Button type="submit" size="xs" disabled={saveLinearIntegration.isPending}>
                {saveLinearIntegration.isPending ? 'Saving…' : 'Save defaults'}
              </Button>
            </div>
          </form>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-semibold">Webhooks and email</h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Set up as reusable alert destinations.
            </p>
          </div>
          <Button asChild variant="outline" size="xs">
            <Link to="/$orgSlug/settings/destinations" params={{ orgSlug }}>
              Alert destinations
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        </div>
      </Panel>

      <ConfirmDialog
        open={confirmingRemove}
        onOpenChange={setConfirmingRemove}
        title="Remove Linear"
        description="Alert rules that create Linear issues stop doing so until Linear is connected again."
        confirmLabel="Remove"
        destructive
        isConfirming={deleteLinearIntegration.isPending}
        onConfirm={async () => {
          try {
            await deleteLinearIntegration.mutateAsync()
            setLinearTeamId('')
            setConfirmingRemove(false)
            toast.success('Linear integration removed')
          } catch (error) {
            console.error('Failed to remove Linear integration:', error)
            toast.error('Failed to remove Linear integration', {
              description: getErrorMessage(error, 'Please try again.'),
            })
          }
        }}
      />
    </SettingsPage>
  )
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
