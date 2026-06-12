import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { Check, Github, KeyRound, Link2, Link2Off, Loader2, Shield } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { linkSocial, listAccounts, unlinkAccount, useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

const providers = [
  {
    id: 'google',
    name: 'Google',
    icon: GoogleIcon,
    description: 'Sign in with your Google account',
    color: 'text-status-danger',
    bgColor: 'bg-status-danger/10',
    disabled: false,
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: Github,
    description: 'Sign in with your GitHub account',
    color: 'text-status-neutral',
    bgColor: 'bg-status-neutral/10',
    disabled: false,
  },
] as const

type ProviderId = (typeof providers)[number]['id']

interface LinkedAccount {
  id: string
  accountId: string
  providerId: string
}

export function AuthenticationSettingsPanel() {
  const { user, isLoading: sessionLoading } = useAuth()
  const [accounts, setAccounts] = useState<LinkedAccount[]>([])
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true)
  const [linkingProvider, setLinkingProvider] = useState<ProviderId | null>(null)
  const [unlinkingAccount, setUnlinkingAccount] = useState<LinkedAccount | null>(null)
  const [isUnlinking, setIsUnlinking] = useState(false)

  useEffect(() => {
    async function fetchAccounts() {
      if (!user) {
        setIsLoadingAccounts(false)
        return
      }

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
        success: true,
      })
      const result = await linkSocial({ provider: providerId })
      if (result?.error) {
        toast.error('Failed to link account', {
          description: result.error.message || 'Please try again',
        })
      }
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
        setAccounts((prev) => prev.filter((account) => account.id !== unlinkingAccount.id))
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

  const isProviderLinked = (providerId: string) =>
    accounts.some((account) => account.providerId === providerId)
  const getLinkedAccount = (providerId: string) =>
    accounts.find((account) => account.providerId === providerId)
  const hasPasswordAccount = accounts.some((account) => account.providerId === 'credential')
  const linkedSocialCount = accounts.filter((account) => account.providerId !== 'credential').length
  const canUnlink = (providerId: string) =>
    providerId === 'credential'
      ? linkedSocialCount > 0
      : hasPasswordAccount || linkedSocialCount > 1
  const isLoading = sessionLoading || isLoadingAccounts

  return (
    <div className="max-w-3xl space-y-6">
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
              {[1, 2, 3].map((item) => (
                <div key={item} className="flex items-center justify-between p-4">
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
              <AccountRow
                icon={KeyRound}
                name="Password"
                description={
                  hasPasswordAccount ? 'Sign in with your email and password' : 'No password set'
                }
                isLinked={hasPasswordAccount}
                color="text-status-active"
                bgColor="bg-status-active/10"
                canUnlink={false}
                showActions={false}
              />
              {providers.map((provider) => {
                const linked = isProviderLinked(provider.id)
                const linkedAccount = getLinkedAccount(provider.id)

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
                    canUnlink={canUnlink(provider.id)}
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

      <Dialog
        open={!!unlinkingAccount}
        onOpenChange={(open) => {
          if (open) {
            trackEvent(AnalyticsEvents.DIALOG_OPENED, {
              [AnalyticsProperties.DIALOG_TYPE]: DialogType.UNLINK_ACCOUNT,
            })
            return
          }
          trackEvent(AnalyticsEvents.DIALOG_CLOSED, {
            [AnalyticsProperties.DIALOG_TYPE]: DialogType.UNLINK_ACCOUNT,
          })
          setUnlinkingAccount(null)
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2Off className="h-5 w-5 text-destructive" />
              Unlink Account
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to unlink this account? You will not be able to sign in with
              this provider unless you link it again.
            </DialogDescription>
          </DialogHeader>

          {unlinkingAccount && (
            <div className="py-4">
              <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  {unlinkingAccount.providerId === 'google' ? (
                    <GoogleIcon className="h-5 w-5 text-status-danger" />
                  ) : (
                    <Github className="h-5 w-5 text-status-neutral" />
                  )}
                </div>
                <div>
                  <p className="font-medium capitalize">{unlinkingAccount.providerId}</p>
                  {unlinkingAccount.accountId ? (
                    <p className="text-sm text-muted-foreground">{unlinkingAccount.accountId}</p>
                  ) : null}
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
    <div className="flex items-center justify-between p-4 transition-colors hover:bg-muted/30">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', bgColor)}>
          <Icon className={cn('h-5 w-5', color)} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{name}</p>
            {isLinked ? (
              <Badge
                variant="outline"
                className="bg-status-success/10 px-1.5 text-[10px] text-status-success"
              >
                <Check className="mr-1 h-3 w-3" />
                Connected
              </Badge>
            ) : null}
            {disabled ? (
              <Badge variant="outline" className="px-1.5 text-[10px]">
                Coming soon
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {showActions ? (
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
                  'border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive'
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
      ) : null}
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
