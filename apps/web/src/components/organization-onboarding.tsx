import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  Cloud,
  Database,
  Github,
  Loader2,
  Mail,
  Shield,
  Sparkles,
  UserPlus,
  Users,
  WandSparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAppMode } from '@/hooks/use-app-mode'
import { linkSocial, listAccounts, useAuth } from '@/hooks/use-auth'
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

const shellTransition = { duration: 0.65, ease: [0.16, 1, 0.3, 1] as const }

const socialProviders: Array<{
  id: ProviderId
  name: string
  icon: LucideIcon | typeof GoogleIcon
  accent: string
  bg: string
  description: string
}> = [
  {
    id: 'google',
    name: 'Google',
    icon: GoogleIcon,
    accent: 'text-status-danger',
    bg: 'bg-status-danger/12',
    description: 'Bring Google sign-in online for less friction across the team.',
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: Github,
    accent: 'text-status-neutral',
    bg: 'bg-status-neutral/12',
    description: 'Keep engineering access one click away with GitHub auth.',
  },
]

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
  const teamReady = members.length > 1 || invitations.length > 0
  const accountsReady = linkedProviderIds.size > 0
  const optionalProgress = Number(teamReady) + Number(accountsReady)

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
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <WandSparkles className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Getting Started</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">
            Bring {organizationName} online
          </span>
        </div>
      ),
      actions: (
        <Button variant="ghost" size="xs" onClick={onSkip}>
          Skip for now
        </Button>
      ),
    }),
    [onSkip, organizationName]
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

  return (
    <div className="space-y-6">
      <motion.section
        className="relative isolate overflow-hidden rounded-[34px] border border-border/70 bg-card/90 shadow-[0_28px_120px_-68px_rgba(15,23,42,0.75)]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shellTransition}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.2),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(251,191,36,0.15),transparent_24%),linear-gradient(140deg,rgba(14,116,144,0.12),transparent_45%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.22),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(251,191,36,0.16),transparent_24%),linear-gradient(140deg,rgba(6,78,59,0.15),transparent_45%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-45 [background-image:linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:34px_34px]" />

        <div className="relative grid gap-8 px-6 py-8 sm:px-8 sm:py-10 xl:grid-cols-[1.2fr_0.8fr] xl:px-10">
          <div className="space-y-7">
            <motion.div
              className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-background/75 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.26em] text-muted-foreground shadow-sm backdrop-blur"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...shellTransition, delay: 0.06 }}
            >
              <Sparkles className="h-3.5 w-3.5 text-status-active" />
              New Organization
            </motion.div>

            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...shellTransition, delay: 0.1 }}
            >
              <h2
                className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl xl:text-[3.7rem]"
                style={{
                  fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif',
                }}
              >
                Turn <span className="text-status-active">{organizationName}</span> into a live
                BullMQ control room.
              </h2>
              <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                Add your first Redis connection, pull teammates into the workspace, and connect the
                sign-in providers your team already trusts. The platform is ready. It just needs a
                signal.
              </p>
            </motion.div>

            <motion.div
              className="flex flex-wrap gap-3"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...shellTransition, delay: 0.16 }}
            >
              <Button asChild size="lg" className="gap-2 rounded-full px-6">
                <Link
                  to="/$orgSlug/connections"
                  params={{ orgSlug }}
                  search={envConnections ? undefined : { create: 1 }}
                >
                  {envConnections ? 'Configure connection source' : 'Add first connection'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full px-6">
                <Link to="/$orgSlug/connections" params={{ orgSlug }}>
                  View connection setup
                </Link>
              </Button>
            </motion.div>

            <motion.div
              className="grid gap-3 md:grid-cols-3"
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...shellTransition, delay: 0.22 }}
            >
              <HeroMetric
                icon={Database}
                label="Primary launch step"
                value={envConnections ? 'Wire env vars' : 'Connect Redis'}
                copy="The only required move before queues and analytics can boot."
              />
              <HeroMetric
                icon={Users}
                label="Optional accelerators"
                value={`${optionalProgress}/2 complete`}
                copy="Invite teammates and link auth providers while the workspace is still fresh."
              />
              <HeroMetric
                icon={BadgeCheck}
                label="Workspace posture"
                value={teamReady || accountsReady ? 'Momentum started' : 'Blank slate'}
                copy="Clean organizations onboard fastest when the first workflow is deliberate."
              />
            </motion.div>
          </div>

          <motion.div
            className="relative"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...shellTransition, delay: 0.2 }}
          >
            <div className="absolute inset-0 rounded-[30px] bg-gradient-to-br from-status-active/10 via-transparent to-status-warning/10 blur-3xl" />
            <Card className="relative overflow-hidden rounded-[30px] border border-border/70 bg-background/80 shadow-[0_24px_90px_-54px_rgba(15,23,42,0.92)] backdrop-blur">
              <CardContent className="space-y-6 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                      Launch Sequence
                    </p>
                    <p className="mt-1 text-xl font-semibold text-foreground">
                      The first ten minutes
                    </p>
                  </div>
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                    Guided
                  </Badge>
                </div>

                <div className="space-y-4">
                  {[
                    {
                      step: '01',
                      title: envConnections
                        ? 'Point Durabull at Redis'
                        : 'Create the first connection',
                      copy: envConnections
                        ? 'Add the env-backed Redis URLs Durabull should read at boot.'
                        : 'Save a Redis endpoint and let queue discovery index the surface area.',
                      progress: 72,
                      tone: 'bg-status-active/70',
                    },
                    {
                      step: '02',
                      title: 'Invite collaborators',
                      copy: 'Loop in teammates before production alerts start landing here.',
                      progress: teamReady ? 100 : 46,
                      tone: 'bg-status-success/70',
                    },
                    {
                      step: '03',
                      title: 'Link Google or GitHub',
                      copy: 'Reduce auth friction now, not during the first urgent incident.',
                      progress: accountsReady ? 100 : 38,
                      tone: 'bg-status-warning/75',
                    },
                  ].map((item, index) => (
                    <div
                      key={item.step}
                      className="rounded-[22px] border border-border/65 bg-muted/28 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/80 text-sm font-semibold text-foreground">
                          {item.step}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{item.title}</p>
                              <p className="text-sm leading-6 text-muted-foreground">{item.copy}</p>
                            </div>
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-background/80">
                            <motion.div
                              className={cn('h-full rounded-full', item.tone)}
                              initial={{ width: 0 }}
                              animate={{ width: `${item.progress}%` }}
                              transition={{ duration: 1, delay: 0.38 + index * 0.12 }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.section>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr_0.95fr]">
        <OnboardingCard
          icon={Database}
          title={envConnections ? 'Point Durabull at Redis' : 'Add your first connection'}
          description={
            envConnections
              ? 'This workspace uses environment-managed connections. Wire the Redis URLs once and the whole platform wakes up on restart.'
              : 'Create a connection, kick off queue discovery, and land directly in the queues dashboard.'
          }
          accent="from-status-active/18 via-status-active/5 to-transparent"
        >
          <div className="space-y-4">
            <div className="rounded-[24px] border border-border/70 bg-background/75 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Connection path</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {envConnections
                      ? 'Define env-backed Redis URLs for the environments you want to expose.'
                      : 'Store a Redis URL, set the environment, and let Durabull discover queues automatically.'}
                  </p>
                </div>
                <Cloud className="h-5 w-5 shrink-0 text-status-active" />
              </div>
            </div>

            {envConnections ? (
              <div className="rounded-[20px] border border-dashed border-border/70 bg-muted/25 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Suggested variable
                </p>
                <code className="mt-2 block rounded-xl bg-background/80 px-3 py-2 font-mono text-sm text-foreground">
                  DURABULL_REDIS_URL_PRODUCTION
                </code>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button asChild className="gap-2">
                <Link
                  to="/$orgSlug/connections"
                  params={{ orgSlug }}
                  search={envConnections ? undefined : { create: 1 }}
                >
                  {envConnections ? 'Open setup guide' : 'Create connection'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/$orgSlug/connections" params={{ orgSlug }}>
                  Review connections
                </Link>
              </Button>
            </div>
          </div>
        </OnboardingCard>

        <OnboardingCard
          icon={UserPlus}
          title="Invite your team"
          description="Shared visibility is worth more than a polished dashboard used by one person."
          accent="from-status-success/18 via-status-success/5 to-transparent"
        >
          {isAuthless ? (
            <div className="rounded-[22px] border border-border/70 bg-muted/25 p-4 text-sm leading-6 text-muted-foreground">
              Team management is disabled in authless mode.
            </div>
          ) : canManageMembers ? (
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4 text-status-success" />
                <span>
                  {membersLoading || invitationsLoading
                    ? 'Loading team posture...'
                    : `${members.length} member${members.length === 1 ? '' : 's'} • ${invitations.length} pending invite${invitations.length === 1 ? '' : 's'}`}
                </span>
              </div>

              <Input
                type="email"
                value={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(event.target.value)
                  setInviteSuccess(null)
                }}
                placeholder="teammate@company.com"
                className="h-11 rounded-2xl bg-background/80"
              />

              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'member' as const, label: 'Member', icon: Users },
                  { value: 'admin' as const, label: 'Admin', icon: Shield },
                ].map((roleOption) => (
                  <button
                    key={roleOption.value}
                    type="button"
                    onClick={() => setInviteRole(roleOption.value)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors',
                      inviteRole === roleOption.value
                        ? 'border-status-success/50 bg-status-success/10 text-status-success'
                        : 'border-border/70 bg-background/70 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <roleOption.icon className="h-3.5 w-3.5" />
                    {roleOption.label}
                  </button>
                ))}
              </div>

              {inviteSuccess ? (
                <div className="flex items-center gap-2 rounded-2xl border border-status-success/30 bg-status-success/10 px-3 py-2 text-sm text-status-success">
                  <Check className="h-4 w-4" />
                  Invitation sent to {inviteSuccess}
                </div>
              ) : null}

              {inviteMember.error ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {inviteMember.error.message}
                </div>
              ) : null}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  className="gap-2"
                  disabled={inviteMember.isPending || !inviteEmail}
                >
                  {inviteMember.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4" />
                      Send invite
                    </>
                  )}
                </Button>
                <Button asChild variant="outline">
                  <Link to="/$orgSlug/team" params={{ orgSlug }}>
                    Open team page
                  </Link>
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[22px] border border-border/70 bg-muted/25 p-4 text-sm leading-6 text-muted-foreground">
                {membersLoading
                  ? 'Loading team permissions...'
                  : 'You do not currently have permission to invite members from this workspace.'}
              </div>
              <Button asChild variant="outline">
                <Link to="/$orgSlug/team" params={{ orgSlug }}>
                  Open team page
                </Link>
              </Button>
            </div>
          )}
        </OnboardingCard>

        <OnboardingCard
          icon={BadgeCheck}
          title="Connect Google or GitHub"
          description="Make future sign-ins boring. That is exactly the point."
          accent="from-status-warning/18 via-status-warning/5 to-transparent"
        >
          {isAuthless ? (
            <div className="rounded-[22px] border border-border/70 bg-muted/25 p-4 text-sm leading-6 text-muted-foreground">
              External auth providers are disabled in authless mode.
            </div>
          ) : (
            <div className="space-y-3">
              {socialProviders.map((provider) => {
                const ProviderIcon = provider.icon
                const linked = linkedProviderIds.has(provider.id)

                return (
                  <div
                    key={provider.id}
                    className="rounded-[22px] border border-border/70 bg-background/76 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={cn(
                            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
                            provider.bg
                          )}
                        >
                          <ProviderIcon className={cn('h-5 w-5', provider.accent)} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{provider.name}</p>
                            {linked ? (
                              <Badge className="rounded-full bg-status-success/12 text-status-success shadow-none dark:text-status-success">
                                Connected
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            {provider.description}
                          </p>
                        </div>
                      </div>
                      {linked ? (
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/settings">Manage</Link>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="gap-2"
                          disabled={accountsLoading || linkingProvider !== null}
                          onClick={() => handleLinkProvider(provider.id)}
                        >
                          {linkingProvider === provider.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Connecting
                            </>
                          ) : (
                            'Connect'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}

              <div className="rounded-[22px] border border-dashed border-border/70 bg-muted/22 p-4 text-sm leading-6 text-muted-foreground">
                {accountsLoading
                  ? 'Loading linked providers...'
                  : linkedProviders.length > 0
                    ? `${linkedProviders.length} provider${linkedProviders.length === 1 ? '' : 's'} linked already.`
                    : 'No external providers linked yet.'}
              </div>
            </div>
          )}
        </OnboardingCard>
      </div>

      <motion.div
        className="flex flex-col items-start justify-between gap-3 rounded-[28px] border border-border/70 bg-card/70 px-5 py-4 sm:flex-row sm:items-center sm:px-6"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...shellTransition, delay: 0.28 }}
      >
        <div>
          <p className="text-sm font-semibold text-foreground">Prefer to come back later?</p>
          <p className="text-sm text-muted-foreground">
            Skip the guided setup now. You can reopen it any time from the empty connection state.
          </p>
        </div>
        <Button variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
      </motion.div>
    </div>
  )
}

function HeroMetric({
  icon: Icon,
  label,
  value,
  copy,
}: {
  icon: LucideIcon
  label: string
  value: string
  copy: string
}) {
  return (
    <Card className="overflow-hidden border border-border/70 bg-background/72 backdrop-blur">
      <CardContent className="space-y-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="text-lg font-semibold text-foreground">{value}</p>
          <p className="text-sm leading-6 text-muted-foreground">{copy}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function OnboardingCard({
  icon: Icon,
  title,
  description,
  accent,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shellTransition}
    >
      <Card className="relative isolate h-full overflow-hidden rounded-[30px] border border-border/70 bg-card/88 shadow-[0_24px_85px_-60px_rgba(15,23,42,0.85)]">
        <div className={cn('absolute inset-0 bg-gradient-to-br opacity-90', accent)} />
        <CardContent className="relative space-y-5 p-5 sm:p-6">
          <div className="space-y-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-background/85 text-foreground shadow-sm">
              <Icon className="h-5 w-5" />
            </span>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-foreground">{title}</h3>
              <p className="text-sm leading-7 text-muted-foreground">{description}</p>
            </div>
          </div>
          {children}
        </CardContent>
      </Card>
    </motion.div>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}
