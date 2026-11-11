import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight, Check, CircleAlert, Eye, EyeOff, Github, Loader2 } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { GoogleIcon } from '@/components/auth-layout'
import { PageTitle } from '@/components/page-title'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Panel, PanelHeader } from '@/components/ui/section'
import { Select } from '@/components/ui/select'
import { useAppMode } from '@/hooks/use-app-mode'
import { linkSocial, listAccounts, useAuth } from '@/hooks/use-auth'
import {
  useCreateConnection,
  useRunConnectionQueueDiscovery,
  useTestConnection,
} from '@/hooks/use-connections'
import {
  type MemberRole,
  useActiveOrganization,
  useInviteMember,
  useOrganizationInvitations,
  useOrganizationMembers,
} from '@/hooks/use-organization'
import { cn } from '@/lib/utils'

interface OrganizationOnboardingProps {
  orgSlug: string
  organizationName: string
  onSkip: () => void
}

interface LinkedAccount {
  id: string
  accountId: string
  providerId: string
}

type ProviderId = 'google' | 'github'
type ConnectionEnvironment = 'development' | 'staging' | 'production'

const CONNECTION_TROUBLESHOOTING_DOCS_URL =
  'https://durabull.io/documentation/getting-started/connection-troubleshooting'
const CONNECTION_MANAGEMENT_DOCS_URL =
  'https://durabull.io/documentation/getting-started/connection-management'

const socialProviders: Array<{
  id: ProviderId
  name: string
  icon: LucideIcon | typeof GoogleIcon
}> = [
  { id: 'google', name: 'Google', icon: GoogleIcon },
  { id: 'github', name: 'GitHub', icon: Github },
]

/**
 * First-run flow for a workspace with no Redis connection. Connecting Redis is
 * the one required step and leads the page; on a hosted workspace two optional
 * steps follow (invite teammates, link a sign-in provider). A local install has
 * no accounts, so it shows the connection step alone.
 */
export function OrganizationOnboarding({
  orgSlug,
  organizationName,
  onSkip,
}: OrganizationOnboardingProps) {
  const { envConnections, isAuthless } = useAppMode()
  const { user } = useAuth()
  const { data: activeOrg } = useActiveOrganization()
  const { data: members = [], isLoading: membersLoading } = useOrganizationMembers()
  const { data: invitations = [], isLoading: invitationsLoading } = useOrganizationInvitations()
  const inviteMember = useInviteMember()

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('member')
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<LinkedAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(!isAuthless)
  const [linkingProvider, setLinkingProvider] = useState<ProviderId | null>(null)

  const currentMembership = members.find((member) => member.userId === user?.id)
  const canManageMembers =
    !isAuthless && (currentMembership?.role === 'owner' || currentMembership?.role === 'admin')
  const linkedProviders = accounts.filter(
    (account): account is LinkedAccount & { providerId: ProviderId } =>
      account.providerId === 'google' || account.providerId === 'github'
  )
  const linkedProviderIds = new Set(linkedProviders.map((account) => account.providerId))
  const accountsReady = linkedProviderIds.size > 0

  useEffect(() => {
    let cancelled = false

    async function loadAccounts() {
      if (isAuthless || !user) {
        setAccounts([])
        setAccountsLoading(false)
        return
      }

      try {
        setAccountsLoading(true)
        const result = await listAccounts()
        if (!cancelled) {
          setAccounts((result.data as LinkedAccount[] | undefined) ?? [])
        }
      } finally {
        if (!cancelled) {
          setAccountsLoading(false)
        }
      }
    }

    void loadAccounts()

    return () => {
      cancelled = true
    }
  }, [isAuthless, user])

  const topBarConfig = useMemo(
    () => ({
      left: <PageTitle title="Get started" />,
      actions: (
        <Button variant="outline" size="xs" onClick={onSkip}>
          Skip for now
        </Button>
      ),
      mobileActions: <DropdownMenuItem onClick={onSkip}>Skip for now</DropdownMenuItem>,
    }),
    [onSkip]
  )

  useAppTopBar(topBarConfig)

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeOrg?.id) return

    try {
      await inviteMember.mutateAsync({
        email: inviteEmail,
        role: inviteRole,
        organizationId: activeOrg.id,
      })
      setInviteSuccess(inviteEmail)
      setInviteEmail('')
      setInviteRole('member')
    } catch {
      setInviteSuccess(null)
    }
  }

  const handleLinkProvider = async (provider: ProviderId) => {
    setLinkingProvider(provider)
    try {
      trackEvent(AnalyticsEvents.USER_ACCOUNT_LINKED, {
        provider,
        success: true,
      })
      const result = await linkSocial({ provider })
      if (result?.error) {
        setLinkingProvider(null)
      }
    } catch {
      setLinkingProvider(null)
    }
  }

  // Steps are numbered only when there is more than one of them.
  const numbered = !isAuthless

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-8 sm:pt-4">
      {isAuthless ? null : (
        <p className="text-[13px] leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">{organizationName}</span> needs one thing
          before it can show queues: a Redis connection. The other steps can wait.
        </p>
      )}

      <Panel>
        <StepHeader number={numbered ? 1 : undefined} title="Connect a Redis instance" />
        {envConnections ? (
          <EnvConnectionGuide orgSlug={orgSlug} />
        ) : (
          <ConnectRedisForm local={isAuthless} />
        )}
      </Panel>

      {isAuthless ? null : (
        <>
          <Panel>
            <StepHeader
              number={2}
              title="Invite your team"
              optional
              status={
                membersLoading || invitationsLoading ? null : (
                  <span className="font-mono text-xs text-muted-foreground">
                    {members.length} member{members.length === 1 ? '' : 's'}
                    {invitations.length > 0 ? ` · ${invitations.length} pending` : ''}
                  </span>
                )
              }
            />
            <div className="p-4">
              {canManageMembers ? (
                <form onSubmit={handleInvite} className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      type="email"
                      aria-label="Teammate email"
                      value={inviteEmail}
                      onChange={(event) => {
                        setInviteEmail(event.target.value)
                        setInviteSuccess(null)
                      }}
                      placeholder="teammate@company.com"
                      className="sm:flex-1"
                    />
                    <div className="flex gap-2">
                      <div className="w-full sm:w-28">
                        <Select
                          aria-label="Role"
                          value={inviteRole}
                          onChange={(event) => setInviteRole(event.target.value as MemberRole)}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </Select>
                      </div>
                      <Button
                        type="submit"
                        variant="outline"
                        className="shrink-0"
                        disabled={inviteMember.isPending || !inviteEmail}
                      >
                        {inviteMember.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : null}
                        Send invite
                      </Button>
                    </div>
                  </div>

                  {inviteSuccess ? (
                    <p className="flex items-center gap-1.5 text-[13px] leading-5 text-status-success">
                      <Check className="h-4 w-4 shrink-0" aria-hidden />
                      Invitation sent to {inviteSuccess}
                    </p>
                  ) : null}

                  {inviteMember.error ? (
                    <p role="alert" className="text-[13px] leading-5 text-status-danger">
                      {inviteMember.error.message}
                    </p>
                  ) : null}
                </form>
              ) : (
                <p className="text-[13px] leading-5 text-muted-foreground">
                  {membersLoading
                    ? 'Loading team permissions…'
                    : 'Only owners and admins can invite members to this organization.'}{' '}
                  <Link
                    to="/$orgSlug/team"
                    params={{ orgSlug }}
                    className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
                  >
                    Open team page
                  </Link>
                </p>
              )}
            </div>
          </Panel>

          <Panel>
            <StepHeader
              number={3}
              title="Link a sign-in provider"
              optional
              status={
                accountsReady ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {linkedProviders.length} linked
                  </span>
                ) : null
              }
            />
            <ul className="divide-y">
              {socialProviders.map((provider) => {
                const ProviderIcon = provider.icon
                const linked = linkedProviderIds.has(provider.id)

                return (
                  <li key={provider.id} className="flex min-h-11 items-center gap-3 px-4 py-2">
                    <ProviderIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-[13px] font-medium">{provider.name}</span>
                    {linked ? (
                      <>
                        <Badge variant="success">Linked</Badge>
                        <Button asChild variant="ghost" size="xs">
                          <Link to="/settings">Manage</Link>
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={accountsLoading || linkingProvider !== null}
                        onClick={() => handleLinkProvider(provider.id)}
                      >
                        {linkingProvider === provider.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : null}
                        {linkingProvider === provider.id ? 'Linking…' : 'Link'}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </Panel>
        </>
      )}
    </div>
  )
}

function StepHeader({
  number,
  title,
  optional = false,
  status,
}: {
  number?: number
  title: string
  optional?: boolean
  status?: React.ReactNode
}) {
  return (
    <PanelHeader className="flex-nowrap justify-start gap-2.5">
      {number ? (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-[11px] text-muted-foreground"
          aria-hidden
        >
          {number}
        </span>
      ) : null}
      <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
      {optional ? <Badge variant="neutral">Optional</Badge> : null}
      {status ? <div className="ml-auto flex shrink-0 items-center">{status}</div> : null}
    </PanelHeader>
  )
}

/**
 * The hero step: name + URL, an inline connectivity test, and a plain
 * statement of what Durabull will read. Saving the connection makes the
 * workspace route move on to the queues page by itself.
 */
function ConnectRedisForm({ local }: { local: boolean }) {
  const formId = useId()
  // A local install usually has one Redis: start with a name so the URL is all that is left.
  const [name, setName] = useState(local ? 'Local Redis' : '')
  const [url, setUrl] = useState('')
  const [showUrl, setShowUrl] = useState(false)
  const [prefix, setPrefix] = useState('bull')
  const [environment, setEnvironment] = useState<ConnectionEnvironment>('development')
  const [allowSelfSignedCerts, setAllowSelfSignedCerts] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const createConnection = useCreateConnection()
  const testConnection = useTestConnection()
  const runQueueDiscovery = useRunConnectionQueueDiscovery()

  const isSaving = createConnection.isPending || createConnection.isSuccess
  const isTesting = testConnection.isPending
  const effectivePrefix = prefix.trim() || 'bull'

  const handleTest = async () => {
    setTestResult(null)
    try {
      const result = await testConnection.mutateAsync({ url, allowSelfSignedCerts })
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      })
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    try {
      const created = await createConnection.mutateAsync({
        name: name.trim(),
        url,
        environment,
        isDefault: true,
        prefix: effectivePrefix,
        allowSelfSignedCerts,
      })
      // Index queue names right away so the queues page has something to show.
      runQueueDiscovery.mutate(created.connection.id)
    } catch {
      // Shown inline from the mutation state.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      <p className="text-[13px] leading-5 text-muted-foreground">
        Use the Redis your BullMQ workers connect to. Durabull scans{' '}
        <code className="rounded-[4px] border bg-muted px-1 py-px font-mono text-xs text-foreground">
          {effectivePrefix}:*:meta
        </code>{' '}
        to find your queues, then reads jobs, workers, and schedules as you browse. The URL is
        stored encrypted.
      </p>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_176px]">
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-name`} className="text-[13px]">
            Name
          </Label>
          <Input
            id={`${formId}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Production"
            autoComplete="off"
            required
            disabled={isSaving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-environment`} className="text-[13px]">
            Environment
          </Label>
          <Select
            id={`${formId}-environment`}
            value={environment}
            onChange={(event) => setEnvironment(event.target.value as ConnectionEnvironment)}
            disabled={isSaving}
          >
            <option value="development">Development</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-url`} className="text-[13px]">
          Redis URL
        </Label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              id={`${formId}-url`}
              type={showUrl ? 'text' : 'password'}
              value={url}
              onChange={(event) => {
                setUrl(event.target.value)
                setTestResult(null)
              }}
              placeholder={local ? 'redis://localhost:6379' : 'redis://default:password@host:6379'}
              autoComplete="off"
              spellCheck={false}
              required
              disabled={isSaving}
              className={cn('pr-9', (showUrl || !url) && 'font-mono')}
            />
            <button
              type="button"
              onClick={() => setShowUrl((value) => !value)}
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-faint transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label={showUrl ? 'Hide connection string' : 'Show connection string'}
              aria-pressed={showUrl}
            >
              {showUrl ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={!url || isTesting || isSaving}
            className="shrink-0"
          >
            {isTesting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Test
          </Button>
        </div>
        <div aria-live="polite">
          {testResult ? (
            <p
              className={cn(
                'flex items-start gap-1.5 text-[13px] leading-5',
                testResult.success ? 'text-status-success' : 'text-status-danger'
              )}
            >
              {testResult.success ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 break-words">{testResult.message}</span>
            </p>
          ) : (
            <p className="text-xs leading-4 text-muted-foreground">
              <span className="font-mono">redis://</span> or{' '}
              <span className="font-mono">rediss://</span> for TLS. Test it before you connect.
            </p>
          )}
        </div>
      </div>

      <details className="group rounded-md border">
        <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-md px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
          <span className="font-medium">Advanced</span>
          <span className="truncate font-mono text-xs text-faint">
            prefix {effectivePrefix}
            {allowSelfSignedCerts ? ' · self-signed TLS' : ''}
          </span>
          <span className="ml-auto text-xs text-faint group-open:hidden">Show</span>
          <span className="ml-auto hidden text-xs text-faint group-open:inline">Hide</span>
        </summary>
        <div className="space-y-4 border-t p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-prefix`} className="text-[13px]">
              BullMQ prefix
            </Label>
            <Input
              id={`${formId}-prefix`}
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              placeholder="bull"
              autoComplete="off"
              spellCheck={false}
              disabled={isSaving}
              className="max-w-48 font-mono"
            />
            <p className="text-xs leading-4 text-muted-foreground">
              Must match the prefix your producers and workers use.
            </p>
          </div>
          <label className="flex items-start gap-2.5 text-[13px] leading-5">
            <input
              type="checkbox"
              checked={allowSelfSignedCerts}
              onChange={(event) => {
                setAllowSelfSignedCerts(event.target.checked)
                setTestResult(null)
              }}
              disabled={isSaving}
              className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-foreground"
            />
            <span>
              Allow self-signed TLS certificates
              <span className="block text-xs leading-4 text-muted-foreground">
                For providers that issue their own certificates, such as Heroku Key-Value Store.
              </span>
            </span>
          </label>
        </div>
      </details>

      {createConnection.error ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-[13px] leading-5 text-status-danger"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{createConnection.error.message}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" disabled={isSaving || !name.trim() || !url}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {createConnection.isSuccess ? 'Opening queues…' : isSaving ? 'Connecting…' : 'Connect'}
        </Button>
        <a
          href={CONNECTION_TROUBLESHOOTING_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-sm text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          Connection troubleshooting
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </form>
  )
}

/** Deployments that read connections from the environment get the variables, not a form. */
function EnvConnectionGuide({ orgSlug }: { orgSlug: string }) {
  return (
    <div className="space-y-4 p-4">
      <p className="text-[13px] leading-5 text-muted-foreground">
        This deployment reads its Redis connections from environment variables. Add one set per
        instance, then restart Durabull. It scans{' '}
        <code className="rounded-[4px] border bg-muted px-1 py-px font-mono text-xs text-foreground">
          bull:*:meta
        </code>{' '}
        to find your queues, then reads jobs, workers, and schedules as you browse.
      </p>
      <pre className="overflow-x-auto rounded-md border bg-muted px-3 py-2.5 font-mono text-xs leading-5 text-foreground">
        {`DURABULL_REDIS_URL_MAIN=redis://default:password@host:6379
DURABULL_REDIS_URL_MAIN_ENVIRONMENT=production
DURABULL_REDIS_URL_MAIN_PREFIX=bull`}
      </pre>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button asChild>
          <Link to="/$orgSlug/connections" params={{ orgSlug }}>
            View connections
          </Link>
        </Button>
        <a
          href={CONNECTION_MANAGEMENT_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-sm text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          Connection variables
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  )
}
