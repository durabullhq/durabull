import { Link2, Webhook } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { AlertWebhookDestinationRecord } from '@/hooks/use-alerts'
import {
  useConnectLinearIntegration,
  useCreateWebhookDestination,
  useDeleteLinearIntegration,
  useDeleteWebhookDestination,
  useLinearIntegration,
  useSaveLinearIntegration,
  useTestLinearIntegration,
  useTestWebhookDestination,
  useUpdateWebhookDestination,
  useWebhookDestinations,
} from '@/hooks/use-alerts'

export function IntegrationsSettingsPanel() {
  const linearIntegrationQuery = useLinearIntegration()
  const connectLinearIntegration = useConnectLinearIntegration()
  const saveLinearIntegration = useSaveLinearIntegration()
  const deleteLinearIntegration = useDeleteLinearIntegration()
  const testLinearIntegration = useTestLinearIntegration()
  const webhookDestinationsQuery = useWebhookDestinations()
  const createWebhookDestination = useCreateWebhookDestination()
  const updateWebhookDestination = useUpdateWebhookDestination()
  const deleteWebhookDestination = useDeleteWebhookDestination()
  const testWebhookDestination = useTestWebhookDestination()
  const [linearTeamId, setLinearTeamId] = useState('')
  const [newWebhookName, setNewWebhookName] = useState('')
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookSecret, setNewWebhookSecret] = useState('')
  const linearIntegration = linearIntegrationQuery.data?.integration ?? null
  const webhookDestinations = webhookDestinationsQuery.data?.destinations ?? []

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
          <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Webhook className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Webhook alert destinations</h3>
              <Badge variant={webhookDestinations.length > 0 ? 'success' : 'secondary'}>
                {webhookDestinations.length > 0
                  ? `${webhookDestinations.length} configured`
                  : 'Not configured'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Save reusable HTTPS endpoints for alert rules. Signing secrets are encrypted at rest
              and never returned by the API.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_1fr_auto]">
              <Input
                value={newWebhookName}
                onChange={(event) => setNewWebhookName(event.target.value)}
                placeholder="Name"
                aria-label="Webhook destination name"
              />
              <Input
                value={newWebhookUrl}
                onChange={(event) => setNewWebhookUrl(event.target.value)}
                placeholder="https://example.com/webhooks/durabull"
                aria-label="Webhook destination URL"
              />
              <Input
                value={newWebhookSecret}
                onChange={(event) => setNewWebhookSecret(event.target.value)}
                placeholder="Optional signing secret"
                aria-label="Webhook destination signing secret"
                type="password"
              />
              <Button
                type="button"
                onClick={async () => {
                  try {
                    await createWebhookDestination.mutateAsync({
                      name: newWebhookName.trim(),
                      url: newWebhookUrl.trim(),
                      signingSecret: newWebhookSecret.trim() || undefined,
                    })
                    setNewWebhookName('')
                    setNewWebhookUrl('')
                    setNewWebhookSecret('')
                    toast.success('Webhook destination saved')
                  } catch (error) {
                    toast.error('Failed to save webhook destination', {
                      description: getErrorMessage(error, 'Please check the URL and try again.'),
                    })
                  }
                }}
                disabled={createWebhookDestination.isPending}
              >
                {createWebhookDestination.isPending ? 'Saving...' : 'Add'}
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {webhookDestinations.map((destination) => (
                <WebhookDestinationRow
                  key={destination.id}
                  destination={destination}
                  onSave={async (input) => {
                    await updateWebhookDestination.mutateAsync({
                      destinationId: destination.id,
                      input,
                    })
                  }}
                  onDelete={async () => {
                    await deleteWebhookDestination.mutateAsync(destination.id)
                  }}
                  onTest={() => testWebhookDestination.mutateAsync(destination.id)}
                  isBusy={
                    updateWebhookDestination.isPending ||
                    deleteWebhookDestination.isPending ||
                    testWebhookDestination.isPending
                  }
                />
              ))}
            </div>
          </div>

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

function WebhookDestinationRow({
  destination,
  onSave,
  onDelete,
  onTest,
  isBusy,
}: {
  destination: AlertWebhookDestinationRecord
  onSave: (input: {
    name?: string
    url?: string
    signingSecret?: string | null
    enabled?: boolean
  }) => Promise<void>
  onDelete: () => Promise<void>
  onTest: () => Promise<{
    success: boolean
    httpStatus: number | null
    durationMs: number
    error?: string
  }>
  isBusy: boolean
}) {
  const [name, setName] = useState(destination.name)
  const [url, setUrl] = useState(destination.url)
  const [secret, setSecret] = useState('')

  useEffect(() => {
    setName(destination.name)
    setUrl(destination.url)
    setSecret('')
  }, [destination.name, destination.url])

  return (
    <div className="rounded-md border border-border/70 bg-background/70 p-3">
      <div className="grid gap-3 md:grid-cols-[1fr_2fr_1fr_auto]">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label={`Webhook destination ${destination.name} name`}
        />
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-label={`Webhook destination ${destination.name} URL`}
        />
        <Input
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder={
            destination.secretConfigured
              ? `Leave blank to keep secret (…${destination.secretLast4 ?? ''})`
              : 'Optional secret'
          }
          aria-label={`Webhook destination ${destination.name} signing secret`}
          type="password"
        />
        <Badge
          variant={destination.enabled ? 'success' : 'secondary'}
          className="justify-self-start"
        >
          {destination.enabled ? 'Enabled' : 'Disabled'}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await onSave({
                name: name.trim(),
                url: url.trim(),
                ...(secret.trim() ? { signingSecret: secret.trim() } : {}),
              })
              setSecret('')
              toast.success('Webhook destination updated')
            } catch (error) {
              toast.error('Failed to update webhook destination', {
                description: getErrorMessage(error, 'Please try again.'),
              })
            }
          }}
          disabled={isBusy}
        >
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await onSave({ enabled: !destination.enabled })
              toast.success(
                destination.enabled ? 'Webhook destination disabled' : 'Webhook destination enabled'
              )
            } catch (error) {
              toast.error('Failed to update webhook destination', {
                description: getErrorMessage(error, 'Please try again.'),
              })
            }
          }}
          disabled={isBusy}
        >
          {destination.enabled ? 'Disable' : 'Enable'}
        </Button>
        {destination.secretConfigured ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await onSave({ signingSecret: null })
                setSecret('')
                toast.success('Webhook signing secret removed')
              } catch (error) {
                toast.error('Failed to remove webhook signing secret', {
                  description: getErrorMessage(error, 'Please try again.'),
                })
              }
            }}
            disabled={isBusy}
          >
            Remove secret
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              const result = await onTest()
              if (result.success) {
                toast.success('Webhook destination test sent', {
                  description: `HTTP ${result.httpStatus ?? 'unknown'} in ${result.durationMs}ms`,
                })
              } else {
                toast.error('Webhook destination test failed', {
                  description: result.error ?? `HTTP ${result.httpStatus ?? 'unknown'}`,
                })
              }
            } catch (error) {
              toast.error('Webhook destination test failed', {
                description: getErrorMessage(error, 'Please try again.'),
              })
            }
          }}
          disabled={isBusy || !destination.enabled}
        >
          Test
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={async () => {
            try {
              await onDelete()
              toast.success('Webhook destination deleted')
            } catch (error) {
              toast.error('Failed to delete webhook destination', {
                description: getErrorMessage(error, 'Remove it from alert rules first.'),
              })
            }
          }}
          disabled={isBusy}
        >
          Delete
        </Button>
      </div>
    </div>
  )
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
