import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { createFileRoute } from '@tanstack/react-router'
import {
  AlertCircle,
  BarChart3,
  Check,
  ExternalLink,
  Github,
  KeyRound,
  Link2,
  Link2Off,
  Loader2,
  Settings,
  Shield,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppTopBar } from '@/components/app-top-bar'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  useConnectLinearIntegration,
  useDeleteLinearIntegration,
  useLinearIntegration,
  useSaveLinearIntegration,
  useTestLinearIntegration,
} from '@/hooks/use-alerts'
import { useAppConfig } from '@/hooks/use-app-config'
import { linkSocial, listAccounts, unlinkAccount, useAuth } from '@/hooks/use-auth'
import { APP_BUILD_INFO } from '@/lib/app-version'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

// Provider configuration
const providers = [
  {
    id: 'google',
    name: 'Google',
    icon: GoogleIcon,
    description: 'Sign in with your Google account',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    disabled: false,
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: Github,
    description: 'Sign in with your GitHub account',
    color: 'text-slate-700 dark:text-slate-300',
    bgColor: 'bg-slate-500/10',
    disabled: false,
  },
] as const

type ProviderId = (typeof providers)[number]['id']

// Account type from better-auth
interface LinkedAccount {
  id: string
  accountId: string
  providerId: string
  accessToken?: string | null
  refreshToken?: string | null
  idToken?: string | null
  expiresAt?: Date | null
  scope?: string | null
}

function SettingsPage() {
  const { user, isLoading: sessionLoading } = useAuth()
  const { config } = useAppConfig()
  const linearIntegrationQuery = useLinearIntegration()
  const connectLinearIntegration = useConnectLinearIntegration()
  const saveLinearIntegration = useSaveLinearIntegration()
  const deleteLinearIntegration = useDeleteLinearIntegration()
  const testLinearIntegration = useTestLinearIntegration()
  const [accounts, setAccounts] = useState<LinkedAccount[]>([])
  const [linearTeamId, setLinearTeamId] = useState('')
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true)
  const [linkingProvider, setLinkingProvider] = useState<ProviderId | null>(null)
  const [unlinkingAccount, setUnlinkingAccount] = useState<LinkedAccount | null>(null)
  const [isUnlinking, setIsUnlinking] = useState(false)
  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Settings className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Settings</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">
            Manage your account settings and preferences
          </span>
        </div>
      ),
    }),
    []
  )

  useAppTopBar(topBarConfig)

  const linearIntegration = linearIntegrationQuery.data?.integration ?? null

  useEffect(() => {
    setLinearTeamId(linearIntegration?.defaultTeamId ?? '')
  }, [linearIntegration?.defaultTeamId])

  // Fetch linked accounts
  useEffect(() => {
    async function fetchAccounts() {
      if (!user) return

      try {
        setIsLoadingAccounts(true)
        const result = await listAccounts()
        if (result.data) {
          setAccounts(result.data as LinkedAccount[])
        }
      } catch (error) {
        console.error('Failed to fetch linked accounts:', error)
        toast.error('Failed to load linked accounts')
      } finally {
        setIsLoadingAccounts(false)
      }
    }

    fetchAccounts()
  }, [user])

  const handleLinkAccount = async (providerId: ProviderId) => {
    setLinkingProvider(providerId)
    try {
      trackEvent(AnalyticsEvents.USER_ACCOUNT_LINKED, {
        provider: providerId,
        success: true, // OAuth redirects, so we track the attempt
      })
      const result = await linkSocial({ provider: providerId })
      if (result?.error) {
        toast.error('Failed to link account', {
          description: result.error.message || 'Please try again',
        })
      }
      // On success, the page will redirect to the OAuth provider
      // and come back with the account linked
    } catch (error) {
      console.error('Failed to link account:', error)
      toast.error('Failed to link account')
    } finally {
      setLinkingProvider(null)
    }
  }

  const handleUnlinkAccount = async () => {
    if (!unlinkingAccount) return

    setIsUnlinking(true)
    try {
      const result = await unlinkAccount({
        providerId: unlinkingAccount.providerId,
        accountId: unlinkingAccount.accountId,
      })

      if (result?.error) {
        trackEvent(AnalyticsEvents.USER_ACCOUNT_UNLINKED, {
          provider: unlinkingAccount.providerId,
          success: false,
        })
        toast.error('Failed to unlink account', {
          description: result.error.message || 'Please try again',
        })
      } else {
        trackEvent(AnalyticsEvents.USER_ACCOUNT_UNLINKED, {
          provider: unlinkingAccount.providerId,
          success: true,
        })
        // Remove from local state
        setAccounts((prev) => prev.filter((a) => a.id !== unlinkingAccount.id))
        toast.success('Account unlinked successfully')
      }
    } catch (error) {
      console.error('Failed to unlink account:', error)
      trackEvent(AnalyticsEvents.USER_ACCOUNT_UNLINKED, {
        provider: unlinkingAccount.providerId,
        success: false,
      })
      toast.error('Failed to unlink account')
    } finally {
      setIsUnlinking(false)
      setUnlinkingAccount(null)
    }
  }

  // Check if a provider is linked
  const isProviderLinked = (providerId: string) => {
    return accounts.some((a) => a.providerId === providerId)
  }

  // Get the linked account for a provider
  const getLinkedAccount = (providerId: string) => {
    return accounts.find((a) => a.providerId === providerId)
  }

  // Check if user has a credential (password) account
  const hasPasswordAccount = accounts.some((a) => a.providerId === 'credential')

  // Count of linked social providers
  const linkedSocialCount = accounts.filter((a) => a.providerId !== 'credential').length

  // Can unlink - user must have at least one other way to sign in
  const canUnlink = (providerId: string) => {
    if (providerId === 'credential') {
      // Can unlink password if there's at least one social provider
      return linkedSocialCount > 0
    }
    // Can unlink social if there's a password or another social provider
    return hasPasswordAccount || linkedSocialCount > 1
  }

  const isLoading = sessionLoading || isLoadingAccounts

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Linked Accounts Section */}
      <Card>
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Authentication</CardTitle>
              <CardDescription>
                Manage how you sign in to your account. Link additional providers for easier access.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                  <Skeleton className="h-9 w-24" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y">
              {/* Password Account */}
              <AccountRow
                icon={KeyRound}
                name="Password"
                description={
                  hasPasswordAccount ? 'Sign in with your email and password' : 'No password set'
                }
                isLinked={hasPasswordAccount}
                color="text-blue-500"
                bgColor="bg-blue-500/10"
                canUnlink={false} // Can't unlink password from this UI
                showActions={false}
              />

              {/* Social Providers */}
              {providers.map((provider) => {
                const linked = isProviderLinked(provider.id)
                const linkedAccount = getLinkedAccount(provider.id)
                const canUnlinkThis = canUnlink(provider.id)

                return (
                  <AccountRow
                    key={provider.id}
                    icon={provider.icon}
                    name={provider.name}
                    description={
                      linked
                        ? `Connected${linkedAccount?.accountId ? ` as ${linkedAccount.accountId}` : ''}`
                        : provider.description
                    }
                    isLinked={linked}
                    color={provider.color}
                    bgColor={provider.bgColor}
                    disabled={provider.disabled}
                    canUnlink={canUnlinkThis}
                    isLinking={linkingProvider === provider.id}
                    onLink={() => handleLinkAccount(provider.id)}
                    onUnlink={() => linkedAccount && setUnlinkingAccount(linkedAccount)}
                  />
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Linear alerts</CardTitle>
              <CardDescription>
                Connect Linear with OAuth and choose defaults for alert-created issues.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={linearIntegration?.validationStatus === 'valid' ? 'success' : 'secondary'}
            >
              {linearIntegration
                ? linearIntegration.validationStatus === 'valid'
                  ? 'Valid'
                  : 'Needs attention'
                : 'Not configured'}
            </Badge>
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
            <div>
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
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={linearTeamId}
                onChange={(event) => setLinearTeamId(event.target.value)}
                placeholder="Default Linear team (name, key, or ID)"
                aria-label="Default Linear team (name, key, or ID)"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {linearIntegration ? (
              <Button
                type="button"
                onClick={async () => {
                  await saveLinearIntegration.mutateAsync({
                    defaultTeamId: linearTeamId.trim() || null,
                  })
                  toast.success('Linear defaults saved')
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
                  const result = await testLinearIntegration.mutateAsync()
                  toast.success('Linear connection verified', {
                    description: result.organizationName,
                  })
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
                  await deleteLinearIntegration.mutateAsync()
                  setLinearTeamId('')
                  toast.success('Linear integration removed')
                }}
                disabled={deleteLinearIntegration.isPending}
              >
                Remove
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            OAuth tokens are encrypted at rest and never returned by the API. Rules can override
            Linear fields, but the default team is used when no rule-level team is set. You can
            enter a team name, key (e.g. INTAKE), or ID — Durabull resolves it automatically.
          </p>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-blue-200 dark:border-blue-900 bg-blue-500/5">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">About linked accounts</p>
            <p className="text-sm text-muted-foreground">
              Linking accounts allows you to sign in using different methods. You can link multiple
              providers to the same account, and sign in using any of them.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted bg-muted/20">
        <CardContent className="flex items-start gap-3 p-4">
          <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">Anonymous usage telemetry</p>
              {config.telemetry.collectionRequired ? (
                <Badge variant="outline" className="text-[10px]">
                  Required
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Durabull collects anonymous usage telemetry to understand feature usage and improve
              the product. We do not collect Redis URLs, queue names, Redis key names, job data,
              logs, emails, names, organizations, or raw error messages.
            </p>
            <a
              href={config.telemetry.disclosureUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Privacy details
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-right text-[11px] text-muted-foreground/70">
        Durabull v{APP_BUILD_INFO.version}
      </p>

      {/* Unlink Confirmation Dialog */}
      <Dialog
        open={!!unlinkingAccount}
        onOpenChange={(open) => {
          if (open) {
            trackEvent(AnalyticsEvents.DIALOG_OPENED, {
              [AnalyticsProperties.DIALOG_TYPE]: DialogType.UNLINK_ACCOUNT,
            })
          } else {
            trackEvent(AnalyticsEvents.DIALOG_CLOSED, {
              [AnalyticsProperties.DIALOG_TYPE]: DialogType.UNLINK_ACCOUNT,
            })
            setUnlinkingAccount(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2Off className="h-5 w-5 text-destructive" />
              Unlink Account
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to unlink this account? You won't be able to sign in with this
              provider unless you link it again.
            </DialogDescription>
          </DialogHeader>

          {unlinkingAccount && (
            <div className="py-4">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  {unlinkingAccount.providerId === 'google' && (
                    <GoogleIcon className="h-5 w-5 text-red-500" />
                  )}
                  {unlinkingAccount.providerId === 'github' && (
                    <Github className="h-5 w-5 text-slate-700 dark:text-slate-300" />
                  )}
                </div>
                <div>
                  <p className="font-medium capitalize">{unlinkingAccount.providerId}</p>
                  {unlinkingAccount.accountId && (
                    <p className="text-sm text-muted-foreground">{unlinkingAccount.accountId}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnlinkingAccount(null)}
              disabled={isUnlinking}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleUnlinkAccount} disabled={isUnlinking}>
              {isUnlinking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Unlinking...
                </>
              ) : (
                <>
                  <Link2Off className="mr-2 h-4 w-4" />
                  Unlink Account
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

interface AccountRowProps {
  icon: React.ComponentType<{ className?: string }>
  name: string
  description: string
  isLinked: boolean
  color: string
  bgColor: string
  disabled?: boolean
  canUnlink?: boolean
  showActions?: boolean
  isLinking?: boolean
  onLink?: () => void
  onUnlink?: () => void
}

function AccountRow({
  icon: Icon,
  name,
  description,
  isLinked,
  color,
  bgColor,
  disabled,
  canUnlink = true,
  showActions = true,
  isLinking,
  onLink,
  onUnlink,
}: AccountRowProps) {
  return (
    <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', bgColor)}>
          <Icon className={cn('h-5 w-5', color)} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{name}</p>
            {isLinked && (
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] px-1.5"
              >
                <Check className="mr-1 h-3 w-3" />
                Connected
              </Badge>
            )}
            {disabled && (
              <Badge variant="outline" className="text-[10px] px-1.5">
                Coming soon
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {showActions && (
        <div>
          {isLinked ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onUnlink}
              disabled={!canUnlink || disabled}
              className={cn(
                canUnlink &&
                  !disabled &&
                  'text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive'
              )}
            >
              <Link2Off className="mr-2 h-4 w-4" />
              Unlink
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onLink} disabled={disabled || isLinking}>
              {isLinking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Linking...
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-4 w-4" />
                  Link Account
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
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
