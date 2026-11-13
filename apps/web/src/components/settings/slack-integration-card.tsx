import { PLANS, requiredPlanForFeature } from '@durabull/api-client/billing'
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Lock,
  MessageSquareText,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { SlackLogo } from '@/components/brand/slack-logo'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SlackDestinationFields } from '@/components/settings/slack-destination-fields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import { type SlackDestinationConfig, useCreateAlertDestination } from '@/hooks/use-alerts'
import { reportUpgradePromptShown, useBilling } from '@/hooks/use-billing'
import {
  type SlackInstallationRecord,
  type SlackIntegrationOverview,
  useConnectSlack,
  useDisconnectSlack,
  useSlackIntegration,
  useSlackManifest,
  useTestSlack,
  useUpdateSlackSettings,
} from '@/hooks/use-slack'
import { cn } from '@/lib/utils'
import {
  DEFAULT_SLACK_DESTINATION_CONFIG,
  SLACK_INSTALL_REQUEST,
  slackDestinationName,
} from '@/lib/slack-destination'

const SLACK_DOCS_URL = 'https://durabull.io/documentation/integrations/slack'
const SLACK_FEATURE = 'integrations.slack' as const

const HIGHLIGHTS = [
  {
    title: 'Incidents in your channels',
    detail: 'Rich alerts with the failed job, attempts and failure reason, colour-coded by state.',
  },
  {
    title: 'Respond without switching apps',
    detail: 'Acknowledge, resolve, snooze the rule or retry the job right from the message.',
  },
  {
    title: 'Messages that keep themselves current',
    detail: 'When an incident changes anywhere in Durabull, the Slack message updates too.',
  },
  {
    title: '/durabull, @Durabull, App Home and link previews',
    detail:
      'Ask for status, incidents, queues and jobs privately or in a thread, and preview pasted links.',
  },
]

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Shows the outcome of the Slack OAuth redirect once, then removes it from the URL. */
export function useSlackOauthResultToast() {
  const handled = useRef(false)
  useEffect(() => {
    if (handled.current || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const result = url.searchParams.get('slack')
    // Install requests are handled by the Slack card.
    if (!result || isSlackInstallRequest(result)) return
    handled.current = true
    const message = url.searchParams.get('message')
    if (result === 'connected') toast.success('Slack connected')
    else if (result === 'cancelled') toast('Slack connection cancelled')
    else toast.error('Slack connection failed', { description: message ?? 'Please try again.' })
    url.searchParams.delete('slack')
    url.searchParams.delete('message')
    window.history.replaceState(window.history.state, '', url.toString())
  }, [])
}

/**
 * Continues an install that started outside Durabull: the direct install URL
 * (`/slack/install`), Slack's App Directory, or a shareable install link all
 * land here with `?slack=install` (or `install-confirm` for members of
 * several organizations, who choose before anything starts). The OAuth flow starts from Durabull so the
 * workspace is bound to this organization and the member who approved it.
 */
function isSlackInstallRequest(value: string): boolean {
  return (Object.values(SLACK_INSTALL_REQUEST) as string[]).includes(value)
}

export function useSlackInstallRequest(
  overview: SlackIntegrationOverview | undefined,
  connect: ReturnType<typeof useConnectSlack>
) {
  const handled = useRef(false)
  useEffect(() => {
    if (handled.current || !overview || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const request = url.searchParams.get('slack')
    if (!request || !isSlackInstallRequest(request)) return
    handled.current = true
    url.searchParams.delete('slack')
    window.history.replaceState(window.history.state, '', url.toString())

    const installation = overview.installation
    if (!overview.entitled) {
      toast('The Slack app is included with the Team plan and above', {
        description: 'Upgrade this organization to connect Slack.',
      })
      return
    }
    if (!overview.configured) {
      toast.error('Slack is not set up on this Durabull deployment')
      return
    }
    if (installation?.status === 'active') {
      toast(`Slack is already connected to ${installation.slackTeamName}`)
      return
    }
    if (!overview.canManage) {
      toast(ADMIN_ONLY_HINT)
      return
    }
    if (request === SLACK_INSTALL_REQUEST.confirm) {
      toast('Select Add to Slack to connect Slack to this organization', {
        description:
          'You belong to several organizations. Switch organizations first if Slack should connect to another one.',
        duration: 15_000,
      })
      return
    }
    connect.mutateAsync({ returnTo: 'integrations' }).catch((error: unknown) => {
      toast.error('Could not start the Slack connection', {
        description: getErrorMessage(error, 'Please try again.'),
      })
    })
  }, [overview, connect])
}

export function SlackIntegrationCard({ orgSlug }: { orgSlug: string }) {
  const slackQuery = useSlackIntegration()
  const overview = slackQuery.data
  const connect = useConnectSlack()
  useSlackInstallRequest(overview, connect)

  if (!overview && slackQuery.isError) {
    return (
      <Panel>
        <CardHeader
          subtitle={
            <span className="text-status-danger">
              {getErrorMessage(slackQuery.error, 'Could not load the Slack integration.')}
            </span>
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void slackQuery.refetch()}
              disabled={slackQuery.isFetching}
            >
              {slackQuery.isFetching ? 'Retrying…' : 'Retry'}
            </Button>
          }
        />
      </Panel>
    )
  }

  if (slackQuery.isLoading || !overview) {
    return (
      <Panel>
        <div className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
      </Panel>
    )
  }

  if (!overview.entitled) return <SlackUpgradeCard orgSlug={orgSlug} />
  if (!overview.configured && !overview.installation) return <SlackNotConfiguredCard />
  if (!overview.installation) return <SlackConnectCard canManage={overview.canManage} />
  return (
    <SlackConnectedCard
      orgSlug={orgSlug}
      installation={overview.installation}
      canManage={overview.canManage}
    />
  )
}

function CardHeader({
  status,
  subtitle,
  actions,
}: {
  status?: React.ReactNode
  subtitle: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
        <SlackLogo className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold">Slack</h3>
          {status}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

function HighlightList({ className }: { className?: string }) {
  return (
    <ul className={cn('grid gap-3 sm:grid-cols-2', className)}>
      {HIGHLIGHTS.map((highlight) => (
        <li key={highlight.title} className="flex gap-2">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" aria-hidden />
          <span className="text-[13px] leading-5">
            <span className="font-medium">{highlight.title}</span>
            <span className="block text-xs text-muted-foreground">{highlight.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Free organizations see what the Slack app does and how to get it. */
export function SlackUpgradeCard({ orgSlug }: { orgSlug: string }) {
  const { data: billing } = useBilling()
  const reported = useRef(false)
  const requiredPlan = PLANS[requiredPlanForFeature(SLACK_FEATURE)]
  const canManage = billing?.enabled ? billing.canManageBilling : false

  useEffect(() => {
    if (reported.current) return
    reported.current = true
    reportUpgradePromptShown({ feature: SLACK_FEATURE })
  }, [])

  return (
    <Panel data-testid="slack-upgrade-card">
      <CardHeader
        status={
          <Badge variant="outline" className="gap-1">
            <Lock className="h-3 w-3" aria-hidden />
            {requiredPlan.name} plan
          </Badge>
        }
        subtitle="Run incident response from Slack."
      />
      <div className="space-y-4 border-t px-4 py-4">
        <HighlightList />
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2.5">
          <p className="flex items-center gap-2 text-[13px]">
            <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              Included with {requiredPlan.name}
              {requiredPlan.monthlyPriceUsd !== null
                ? ` from $${requiredPlan.monthlyPriceUsd}/month per organization`
                : ''}
              , along with webhook and Linear alerts.
            </span>
          </p>
          {canManage ? (
            <Button asChild size="xs">
              <Link to="/$orgSlug/settings/billing" params={{ orgSlug }}>
                Upgrade to {requiredPlan.name}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              Ask an organization owner to upgrade to {requiredPlan.name}.
            </span>
          )}
        </div>
      </div>
    </Panel>
  )
}

/** Self-hosted deployments need their own Slack app before members can connect it. */
export function SlackNotConfiguredCard() {
  const [showManifest, setShowManifest] = useState(false)
  const manifestQuery = useSlackManifest(showManifest)
  const manifestJson = manifestQuery.data
    ? JSON.stringify(manifestQuery.data.manifest, null, 2)
    : ''

  return (
    <Panel data-testid="slack-not-configured-card">
      <CardHeader
        status={<Badge variant="neutral">Not set up</Badge>}
        subtitle="This Durabull server does not have Slack app credentials yet."
        actions={
          <Button asChild variant="outline" size="xs">
            <a href={SLACK_DOCS_URL} target="_blank" rel="noreferrer">
              Setup guide
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </Button>
        }
      />
      <div className="space-y-3 border-t px-4 py-3 text-[13px]">
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Create a Slack app from the manifest for this deployment.</li>
          <li>
            Set <code className="font-mono text-xs">SLACK_CLIENT_ID</code>,{' '}
            <code className="font-mono text-xs">SLACK_CLIENT_SECRET</code> and{' '}
            <code className="font-mono text-xs">SLACK_SIGNING_SECRET</code>, then restart Durabull.
          </li>
          <li>Come back here and connect your workspace.</li>
        </ol>
        {showManifest ? (
          <div className="space-y-2">
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
              {manifestQuery.isLoading ? 'Loading manifest…' : manifestJson}
            </pre>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={!manifestJson}
              onClick={async () => {
                await navigator.clipboard.writeText(manifestJson)
                toast.success('Manifest copied', {
                  description: 'Paste it at api.slack.com/apps → Create New App → From a manifest.',
                })
              }}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy manifest
            </Button>
          </div>
        ) : (
          <Button type="button" size="xs" variant="outline" onClick={() => setShowManifest(true)}>
            Show app manifest
          </Button>
        )}
      </div>
    </Panel>
  )
}

function ConnectButton({
  label = 'Add to Slack',
  returnTo = 'integrations',
  variant = 'default',
}: {
  label?: string
  returnTo?: 'integrations' | 'destinations'
  variant?: 'default' | 'outline'
}) {
  const connect = useConnectSlack()
  return (
    <Button
      type="button"
      size="xs"
      variant={variant}
      disabled={connect.isPending}
      onClick={async () => {
        try {
          await connect.mutateAsync({ returnTo })
        } catch (error) {
          toast.error('Could not start the Slack connection', {
            description: getErrorMessage(error, 'Please try again.'),
          })
        }
      }}
    >
      <SlackLogo className="h-3.5 w-3.5" title="" />
      {connect.isPending ? 'Opening Slack…' : label}
    </Button>
  )
}

export { ConnectButton as SlackConnectButton }

const ADMIN_ONLY_HINT = 'Ask an organization owner or admin to connect Slack.'

export function SlackConnectCard({ canManage = true }: { canManage?: boolean }) {
  return (
    <Panel data-testid="slack-connect-card">
      <CardHeader
        status={<Badge variant="neutral">Not connected</Badge>}
        subtitle="Send incidents to Slack and respond from the message."
        actions={
          canManage ? (
            <ConnectButton />
          ) : (
            <span className="text-xs text-muted-foreground">{ADMIN_ONLY_HINT}</span>
          )
        }
      />
      <div className="border-t px-4 py-4">
        <HighlightList />
      </div>
    </Panel>
  )
}

function SettingToggle({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-[13px]">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-input accent-foreground"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {label}
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  )
}

function ChecklistItem({
  done,
  title,
  children,
}: {
  done: boolean
  title: string
  children?: React.ReactNode
}) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          done && 'border-status-success bg-status-success/10 text-status-success'
        )}
      >
        {done ? <Check className="h-3 w-3" aria-hidden /> : null}
        <span className="sr-only">{done ? 'Done:' : 'To do:'}</span>
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className={cn('text-[13px] font-medium', done && 'text-muted-foreground')}>{title}</p>
        {children}
      </div>
    </li>
  )
}

export function SlackConnectedCard({
  orgSlug,
  installation,
  canManage = true,
}: {
  orgSlug: string
  installation: SlackInstallationRecord
  /** Owners and admins may reconnect, remove and change settings. */
  canManage?: boolean
}) {
  const updateSettings = useUpdateSlackSettings()
  const disconnect = useDisconnectSlack()
  const test = useTestSlack()
  const createDestination = useCreateAlertDestination()
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [channelConfig, setChannelConfig] = useState<Partial<SlackDestinationConfig>>({})
  const needsReconnect = installation.status !== 'active'
  const needsScopes = !needsReconnect && installation.missingScopes.length > 0
  const hasDestination = installation.slackDestinationCount > 0

  async function saveSetting(input: { actionsEnabled?: boolean; unfurlsEnabled?: boolean }) {
    try {
      await updateSettings.mutateAsync(input)
    } catch (error) {
      toast.error('Could not update Slack settings', {
        description: getErrorMessage(error, 'Please try again.'),
      })
    }
  }

  const workspace = installation.slackTeamUrl ? (
    <a
      href={installation.slackTeamUrl}
      target="_blank"
      rel="noreferrer"
      className="hover:text-foreground hover:underline"
    >
      {installation.slackTeamName}
    </a>
  ) : (
    installation.slackTeamName
  )

  return (
    <Panel data-testid="slack-connected-card">
      <CardHeader
        status={
          needsReconnect ? (
            <Badge variant="warning">Reconnect needed</Badge>
          ) : (
            <Badge variant="success">Connected</Badge>
          )
        }
        subtitle={workspace}
        actions={
          <>
            {needsReconnect || needsScopes ? (
              canManage ? (
                <ConnectButton label="Reconnect" />
              ) : (
                <span className="text-xs text-muted-foreground">
                  Ask an owner or admin to reconnect.
                </span>
              )
            ) : (
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={test.isPending}
                onClick={async () => {
                  try {
                    const result = await test.mutateAsync()
                    toast.success('Slack connection verified', { description: result.teamName })
                  } catch (error) {
                    toast.error('Slack connection failed', {
                      description: getErrorMessage(error, 'Reconnect Slack and try again.'),
                    })
                  }
                }}
              >
                {test.isPending ? 'Testing…' : 'Test connection'}
              </Button>
            )}
            {canManage ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="text-status-danger hover:text-status-danger"
                onClick={() => setConfirmingRemove(true)}
              >
                Remove
              </Button>
            ) : null}
          </>
        }
      />

      {needsReconnect || needsScopes ? (
        <div className="flex items-start gap-2 border-t bg-status-warning/10 px-4 py-2.5 text-[13px]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" aria-hidden />
          <p>
            {needsReconnect
              ? `Slack stopped accepting Durabull's token (${installation.statusReason ?? 'revoked'}). Alerts to Slack are paused until you reconnect.`
              : `This version of Durabull needs more Slack permissions (${installation.missingScopes.join(', ')}). Reconnect to grant them.`}
          </p>
        </div>
      ) : null}

      <div className="border-t px-4 py-4">
        <ol className="space-y-4">
          <ChecklistItem done title={`Connected to ${installation.slackTeamName}`} />
          <ChecklistItem
            done={hasDestination}
            title={
              hasDestination
                ? `${installation.slackDestinationCount} Slack destination${installation.slackDestinationCount === 1 ? '' : 's'} ready`
                : 'Choose a channel for alerts'
            }
          >
            {/* While a reconnect is pending, Reconnect stays the card's one primary action. */}
            {hasDestination || needsReconnect || needsScopes ? (
              <Link
                to="/$orgSlug/settings/destinations"
                params={{ orgSlug }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Manage destinations
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            ) : (
              <form
                className="max-w-md space-y-2"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (!channelConfig.channelId) return
                  try {
                    await createDestination.mutateAsync({
                      type: 'slack',
                      name: slackDestinationName(channelConfig),
                      config: {
                        ...DEFAULT_SLACK_DESTINATION_CONFIG,
                        channelId: channelConfig.channelId,
                        channelName: channelConfig.channelName,
                      },
                    })
                    toast.success('Slack destination created', {
                      description: `Pick it on any alert rule to send incidents to #${channelConfig.channelName}.`,
                    })
                    setChannelConfig({})
                  } catch (error) {
                    toast.error('Could not create the Slack destination', {
                      description: getErrorMessage(error, 'Please try again.'),
                    })
                  }
                }}
              >
                <SlackDestinationFields
                  config={channelConfig}
                  onChange={setChannelConfig}
                  idPrefix="slack-quick-destination"
                  compact
                />
                <Button
                  type="submit"
                  size="xs"
                  disabled={!channelConfig.channelId || createDestination.isPending}
                >
                  {createDestination.isPending ? 'Creating…' : 'Create Slack destination'}
                </Button>
              </form>
            )}
          </ChecklistItem>
          <ChecklistItem done={false} title="Route an alert rule to it">
            <p className="text-xs text-muted-foreground">
              Open any alert rule and add the Slack destination under{' '}
              <span className="font-medium text-foreground">Notify</span>.{' '}
              <Link
                to="/$orgSlug/alerts"
                params={{ orgSlug }}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                Go to alerts
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            </p>
          </ChecklistItem>
          <ChecklistItem done={false} title="Try it in Slack">
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
              Type <code className="font-mono text-foreground">/durabull status</code> in any
              channel, or open the Durabull app's Home tab.
            </p>
          </ChecklistItem>
        </ol>
      </div>

      <div className="grid gap-3 border-t px-4 py-3 sm:grid-cols-2">
        <SettingToggle
          id="slack-actions-enabled"
          label="Allow actions from Slack"
          description="Members can acknowledge, resolve, snooze, retry and pause from Slack. Slack users act as the Durabull member with the same email."
          checked={installation.actionsEnabled}
          disabled={!canManage || updateSettings.isPending}
          onChange={(checked) => void saveSetting({ actionsEnabled: checked })}
        />
        <SettingToggle
          id="slack-unfurls-enabled"
          label="Preview Durabull links"
          description="Queue, job and alert rule links pasted by members show live details in the channel."
          checked={installation.unfurlsEnabled}
          disabled={!canManage || updateSettings.isPending}
          onChange={(checked) => void saveSetting({ unfurlsEnabled: checked })}
        />
      </div>

      <ConfirmDialog
        open={confirmingRemove}
        onOpenChange={setConfirmingRemove}
        title="Remove Slack"
        description="Slack destinations stop delivering and existing messages stop updating until Slack is connected again. Your destinations and rules are kept."
        confirmLabel="Remove"
        destructive
        isConfirming={disconnect.isPending}
        onConfirm={async () => {
          try {
            await disconnect.mutateAsync()
            setConfirmingRemove(false)
            toast.success('Slack removed')
          } catch (error) {
            toast.error('Could not remove Slack', {
              description: getErrorMessage(error, 'Please try again.'),
            })
          }
        }}
      />
    </Panel>
  )
}
