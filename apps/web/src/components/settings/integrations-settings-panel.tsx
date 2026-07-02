import { Link } from '@tanstack/react-router'
import { ChevronRight, Link2, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useConnectLinearIntegration,
  useDeleteLinearIntegration,
  useLinearIntegration,
  useSaveLinearIntegration,
  useTestLinearIntegration,
} from '@/hooks/use-alerts'

export function IntegrationsSettingsPanel({ orgSlug }: { orgSlug: string }) {
  const linearIntegrationQuery = useLinearIntegration()
  const connectLinearIntegration = useConnectLinearIntegration()
  const saveLinearIntegration = useSaveLinearIntegration()
  const deleteLinearIntegration = useDeleteLinearIntegration()
  const testLinearIntegration = useTestLinearIntegration()
  const [linearTeamId, setLinearTeamId] = useState('')
  const linearIntegration = linearIntegrationQuery.data?.integration ?? null

  useEffect(() => {
    setLinearTeamId(linearIntegration?.defaultTeamId ?? '')
  }, [linearIntegration?.defaultTeamId])

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Integrations</CardTitle>
              <CardDescription>
                Connect third-party tools and choose defaults for integrations.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <Link
            to="/$orgSlug/settings/destinations"
            params={{ orgSlug }}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-4 transition-colors hover:border-foreground/40"
          >
            <div className="flex min-w-0 items-start gap-3">
              <Send className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Alert destinations</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Webhook, email, and Linear destinations moved to their own settings page — manage
                  reusable notification targets there.
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>

          <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold">Linear alerts</h3>
              <Badge
                variant={linearIntegration?.validationStatus === 'valid' ? 'success' : 'secondary'}
              >
                {linearIntegration
                  ? linearIntegration.validationStatus === 'valid'
                    ? 'Valid'
                    : 'Needs attention'
                  : 'Not configured'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Connect Linear with OAuth and choose defaults for alert-created issues.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {linearIntegration?.linearOrganizationName ? (
                <span className="text-xs text-muted-foreground">
                  {linearIntegration.linearOrganizationName}
                </span>
              ) : null}
              {linearIntegration?.scopes ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {linearIntegration.scopes}
                </span>
              ) : null}
            </div>

            {!linearIntegration ? (
              <div className="mt-4">
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      const result = await connectLinearIntegration.mutateAsync()
                      window.location.assign(result.authorizationUrl)
                    } catch (error) {
                      console.error('Failed to start Linear OAuth:', error)
                      toast.error('Failed to start Linear connection', {
                        description: getErrorMessage(
                          error,
                          'Check the Linear OAuth configuration and try again.'
                        ),
                      })
                    }
                  }}
                  disabled={connectLinearIntegration.isPending}
                >
                  {connectLinearIntegration.isPending ? 'Connecting...' : 'Connect Linear'}
                </Button>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={linearTeamId}
                  onChange={(event) => setLinearTeamId(event.target.value)}
                  placeholder="Default Linear team (name, key, or ID)"
                  aria-label="Default Linear team (name, key, or ID)"
                />
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {linearIntegration ? (
                <Button
                  type="button"
                  onClick={async () => {
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
                  disabled={saveLinearIntegration.isPending}
                >
                  {saveLinearIntegration.isPending ? 'Saving...' : 'Save defaults'}
                </Button>
              ) : null}
              {linearIntegration ? (
                <Button
                  type="button"
                  variant="outline"
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
                  {testLinearIntegration.isPending ? 'Testing...' : 'Test connection'}
                </Button>
              ) : null}
              {linearIntegration ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={async () => {
                    try {
                      await deleteLinearIntegration.mutateAsync()
                      setLinearTeamId('')
                      toast.success('Linear integration removed')
                    } catch (error) {
                      console.error('Failed to remove Linear integration:', error)
                      toast.error('Failed to remove Linear integration', {
                        description: getErrorMessage(error, 'Please try again.'),
                      })
                    }
                  }}
                  disabled={deleteLinearIntegration.isPending}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            OAuth tokens are encrypted at rest and never returned by the API. Rules can override
            Linear fields, but the default team is used when no rule-level team is set. You can
            enter a team name, key (e.g. INTAKE), or ID — Durabull resolves it automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
