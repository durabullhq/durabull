import { organization } from '@durabull/auth/client'
import { createFileRoute, Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  AlertCircle,
  Building2,
  Check,
  Github,
  Loader2,
  LogIn,
  User,
  UserPlus,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { AuthLayout } from '@/components/auth-layout'
import { DurabullLogo, DurabullWordmark } from '@/components/durabull-logo'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { getAuthErrorMessage, useAuth } from '@/hooks/use-auth'
import {
  type InvitationDetails,
  useAcceptInvitation,
  useInvitationById,
  useRejectInvitation,
} from '@/hooks/use-organization'

export const Route = createFileRoute('/invite/$invitationId')({
  component: InviteAcceptPage,
})

/**
 * Sign In form for existing users on the invite page.
 * Email is pre-filled from the invitation and read-only.
 */
function InviteSignInForm({
  email,
  invitationId,
  inviteData,
  onError,
}: {
  email: string
  invitationId: string
  inviteData: InvitationDetails
  onError: (error: string) => void
}) {
  const navigate = useNavigate()
  const { signIn, refetch } = useAuth()
  const acceptInvitation = useAcceptInvitation()
  const [isLoading, setIsLoading] = useState(false)
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    onError('')

    try {
      // Sign in
      const result = await signIn.email({ email, password })

      if (result.error) {
        onError(getAuthErrorMessage(result, 'Invalid password'))
        setIsLoading(false)
        return
      }

      // Refetch session to update auth state
      await refetch()

      // Accept the invitation
      await acceptInvitation.mutateAsync(invitationId)

      // Set the new org as active
      await organization.setActive({ organizationId: inviteData.organization.id })

      // Skip org setup page by setting a flag
      sessionStorage.setItem('skipOrgSetup', 'true')

      // Navigate to the organization dashboard
      navigate({ to: '/$orgSlug', params: { orgSlug: inviteData.organization.slug } })
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to sign in')
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">Sign in to accept this invitation</p>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} disabled className="bg-muted" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading}
          autoFocus
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <LogIn className="mr-2 h-4 w-4" />
        )}
        Sign In & Accept Invitation
      </Button>
    </form>
  )
}

/**
 * Sign Up form for new users on the invite page.
 * Email is pre-filled from the invitation and read-only.
 */
function InviteSignUpForm({
  email,
  invitationId,
  inviteData,
  onError,
}: {
  email: string
  invitationId: string
  inviteData: InvitationDetails
  onError: (error: string) => void
}) {
  const navigate = useNavigate()
  const { signUp, refetch } = useAuth()
  const acceptInvitation = useAcceptInvitation()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    confirmPassword: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    onError('')

    // Validate password match
    if (formData.password !== formData.confirmPassword) {
      onError('Passwords do not match')
      setIsLoading(false)
      return
    }

    // Validate password length
    if (formData.password.length < 8) {
      onError('Password must be at least 8 characters')
      setIsLoading(false)
      return
    }

    try {
      // Sign up
      const result = await signUp.email({
        email,
        password: formData.password,
        name: formData.name,
      })

      if (result.error) {
        onError(getAuthErrorMessage(result, 'Failed to create account'))
        setIsLoading(false)
        return
      }

      // Refetch session - better-auth auto-logs in after signup
      await refetch()

      // Accept the invitation
      await acceptInvitation.mutateAsync(invitationId)

      // Set the new org as active
      await organization.setActive({ organizationId: inviteData.organization.id })

      // Skip org setup page by setting a flag
      sessionStorage.setItem('skipOrgSetup', 'true')

      // Navigate to the organization dashboard
      navigate({ to: '/$orgSlug', params: { orgSlug: inviteData.organization.slug } })
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create account')
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">
        Create an account to accept this invitation
      </p>

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          type="text"
          placeholder="Your name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          disabled={isLoading}
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} disabled className="bg-muted" />
        <p className="text-xs text-muted-foreground">
          This is the email address you were invited with
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          required
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="••••••••"
          value={formData.confirmPassword}
          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          required
          disabled={isLoading}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <UserPlus className="mr-2 h-4 w-4" />
        )}
        Create Account & Accept Invitation
      </Button>
    </form>
  )
}

function InviteAcceptPage() {
  const { invitationId } = useParams({ from: '/invite/$invitationId' })
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: sessionLoading, user, signIn, signOut } = useAuth()

  const {
    data: inviteData,
    isLoading: inviteLoading,
    error: inviteError,
  } = useInvitationById(invitationId)

  const acceptInvitation = useAcceptInvitation()
  const rejectInvitation = useRejectInvitation()

  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [socialProviderLoading, setSocialProviderLoading] = useState<'google' | 'github' | null>(
    null
  )

  const isLoading = sessionLoading || inviteLoading

  const getInviteCallbackURL = () => {
    if (typeof window === 'undefined') return undefined
    return `${window.location.origin}/invite/${invitationId}`
  }

  const handleSocialAuth = async (provider: 'google' | 'github') => {
    const callbackURL = getInviteCallbackURL()
    setError(null)
    setSocialProviderLoading(provider)

    try {
      const result = await signIn.social({
        provider,
        requestSignUp: true,
        ...(callbackURL
          ? {
              callbackURL,
              newUserCallbackURL: callbackURL,
            }
          : {}),
      })

      if (result?.error) {
        const fallbackMessage =
          provider === 'google' ? 'Failed to sign in with Google' : 'Failed to sign in with GitHub'
        const errorMessage = getAuthErrorMessage(result, fallbackMessage)

        if (errorMessage === 'ACCOUNT_EXISTS') {
          navigate({ to: '/auth-error', search: { reason: 'account-exists', provider } })
          return
        }

        setError(errorMessage)
        setSocialProviderLoading(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to continue with social login')
      setSocialProviderLoading(null)
    }
  }

  // Handle accepting the invitation (for already authenticated users)
  const handleAccept = async () => {
    if (!inviteData) return
    setIsProcessing(true)
    setError(null)

    try {
      await acceptInvitation.mutateAsync(invitationId)
      // After accepting, set the new org as active and redirect to dashboard
      await organization.setActive({ organizationId: inviteData.organization.id })
      navigate({ to: '/$orgSlug', params: { orgSlug: inviteData.organization.slug } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation')
      setIsProcessing(false)
    }
  }

  // Handle rejecting the invitation
  const handleReject = async () => {
    setIsProcessing(true)
    setError(null)

    try {
      await rejectInvitation.mutateAsync(invitationId)
      // Navigate to home after rejection
      navigate({ to: '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline invitation')
      setIsProcessing(false)
    }
  }

  // Handle sign out to switch accounts
  const handleSignOut = async () => {
    await signOut()
    // Page will re-render with isAuthenticated = false
  }

  // Loading state
  if (isLoading) {
    return (
      <AuthLayout>
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AuthLayout>
    )
  }

  // Error state - invitation not found or invalid
  if (inviteError || !inviteData) {
    return (
      <AuthLayout>
        <div className="flex min-h-screen items-center justify-center p-4 pt-24">
          <Card className="w-full max-w-md border-border bg-card p-8">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h1 className="mt-4 text-xl font-semibold text-foreground">Invitation Not Found</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {inviteError?.message ||
                  'This invitation may have expired, been revoked, or already been used.'}
              </p>
              <div className="mt-6 flex gap-3">
                <Button variant="outline" asChild>
                  <Link to="/">Go Home</Link>
                </Button>
                {!isAuthenticated && (
                  <Button asChild>
                    <Link to="/login">Sign In</Link>
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      </AuthLayout>
    )
  }

  const { invitation, organization: org, inviter } = inviteData

  // Check if logged-in user's email matches the invitation
  const emailMismatch = isAuthenticated && user?.email && user.email !== invitation.email

  return (
    <AuthLayout>
      <div className="flex min-h-screen items-center justify-center p-4 pt-24">
        <Card className="w-full max-w-md border-border bg-card p-8">
          {/* Logo */}
          <div className="mb-6 flex flex-col items-center">
            <div className="flex items-center gap-2">
              <DurabullLogo className="h-10 w-10 text-primary" />
              <DurabullWordmark className="h-6" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-foreground">You've Been Invited</h1>
          </div>

          {/* Invitation Details Card */}
          <div className="mb-6 rounded-lg border border-border bg-muted/50 p-4">
            {/* Organization */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {org.logo ? (
                  <img
                    src={org.logo}
                    alt={org.name}
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                ) : (
                  <Building2 className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="font-medium text-foreground">{org.name}</p>
                <p className="text-sm text-muted-foreground">Organization</p>
              </div>
            </div>

            <Separator className="my-3" />

            {/* Inviter */}
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-7 w-7 rounded-md">
                <AvatarImage src={inviter.image || undefined} alt={inviter.name} />
                <AvatarFallback className="rounded-md bg-primary/10 text-primary text-xs">
                  {inviter.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm text-foreground">{inviter.name}</p>
                <p className="text-xs text-muted-foreground">Invited you</p>
              </div>
            </div>

            {/* Role */}
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm text-foreground capitalize">{invitation.role}</p>
                <p className="text-xs text-muted-foreground">Your role</p>
              </div>
            </div>
          </div>

          {/* Email mismatch warning */}
          {emailMismatch && (
            <div className="mb-6 flex items-start gap-2 rounded-md border border-status-warning/20 bg-status-warning/10 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
              <div className="text-sm">
                <p className="font-medium text-status-warning">Email Mismatch</p>
                <p className="text-muted-foreground">
                  This invitation was sent to <strong>{invitation.email}</strong>, but you're signed
                  in as <strong>{user?.email}</strong>. You may need to sign out and use the correct
                  account.
                </p>
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="mb-6 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Actions based on auth state */}
          {isAuthenticated ? (
            // Logged in - show accept/reject buttons
            <div className="space-y-3">
              <Button
                className="w-full"
                onClick={handleAccept}
                disabled={isProcessing || !!emailMismatch}
              >
                {isProcessing && acceptInvitation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Accept Invitation
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleReject}
                disabled={isProcessing}
              >
                {isProcessing && rejectInvitation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <X className="mr-2 h-4 w-4" />
                )}
                Decline
              </Button>

              {emailMismatch && (
                <p className="text-center text-xs text-muted-foreground pt-2">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="text-primary hover:underline"
                  >
                    Sign out and use a different account
                  </button>
                </p>
              )}
            </div>
          ) : (
            // Not logged in - allow social auth and email/password fallback
            <div className="space-y-4">
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSocialAuth('google')}
                  disabled={socialProviderLoading !== null}
                >
                  {socialProviderLoading === 'google' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
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
                  )}
                  Continue with Google
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSocialAuth('github')}
                  disabled={socialProviderLoading !== null}
                >
                  {socialProviderLoading === 'github' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Github className="mr-2 h-4 w-4" />
                  )}
                  Continue with GitHub
                </Button>
              </div>

              <div className="relative my-4">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  OR
                </span>
              </div>

              {authMode === 'signin' ? (
                <InviteSignInForm
                  email={invitation.email}
                  invitationId={invitationId}
                  inviteData={inviteData}
                  onError={setError}
                />
              ) : (
                <InviteSignUpForm
                  email={invitation.email}
                  invitationId={invitationId}
                  inviteData={inviteData}
                  onError={setError}
                />
              )}

              {/* Toggle between sign in and sign up */}
              <p className="text-center text-sm text-muted-foreground">
                {authMode === 'signin' ? (
                  <>
                    Need to create an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setAuthMode('signup')
                      }}
                      className="text-primary hover:underline"
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setAuthMode('signin')
                      }}
                      className="text-primary hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </div>
          )}
        </Card>
      </div>
    </AuthLayout>
  )
}
