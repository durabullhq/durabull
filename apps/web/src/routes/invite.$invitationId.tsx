import { organization } from '@durabull/auth/client'
import { createFileRoute, Link, useNavigate, useParams } from '@tanstack/react-router'
import { Loader2, MailX } from 'lucide-react'
import { useState } from 'react'
import {
  AuthAccountFooter,
  AuthDivider,
  AuthError,
  AuthField,
  AuthHeader,
  AuthLayout,
  AuthLoading,
  authLinkClassName,
  SocialAuthButtons,
} from '@/components/auth-layout'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
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
      {/* The invited address is fixed (shown above); keep it in the form for password managers. */}
      <input
        type="email"
        name="email"
        aria-label="Email"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />

      <AuthField id="password" label="Password">
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          className="h-9"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading}
          autoFocus
        />
      </AuthField>

      <Button type="submit" className="h-9 w-full" disabled={isLoading}>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Sign in & accept invitation
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
      <AuthField id="name" label="Name">
        <Input
          id="name"
          type="text"
          autoComplete="name"
          placeholder="Ada Lovelace"
          className="h-9"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          disabled={isLoading}
          autoFocus
        />
      </AuthField>

      <input
        type="email"
        name="email"
        aria-label="Email"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />

      <AuthField id="password" label="Password" hint="At least 8 characters.">
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          className="h-9"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          required
          disabled={isLoading}
        />
      </AuthField>

      <AuthField id="confirmPassword" label="Confirm password">
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          className="h-9"
          value={formData.confirmPassword}
          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          required
          disabled={isLoading}
        />
      </AuthField>

      <Button type="submit" className="h-9 w-full" disabled={isLoading}>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Create account & accept invitation
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
    return <AuthLoading label="Loading invitation…" />
  }

  // Error state - invitation not found, expired, or already used
  if (inviteError || !inviteData) {
    const problem = describeInvitationProblem(inviteError?.message)

    return (
      <AuthLayout>
        <EmptyState
          size="inline"
          tone="danger"
          icon={MailX}
          title={problem.title}
          description={problem.description}
          className="px-0 py-2"
          actions={
            <>
              <Button variant="outline" asChild>
                <Link to="/">Go home</Link>
              </Button>
              {!isAuthenticated && (
                <Button asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
              )}
            </>
          }
        />
      </AuthLayout>
    )
  }

  const { invitation, organization: org, inviter } = inviteData

  // Check if logged-in user's email matches the invitation
  const emailMismatch = isAuthenticated && user?.email && user.email !== invitation.email
  const expiresAt = formatInvitationDate(invitation.expiresAt)

  return (
    <AuthLayout
      footer={
        isAuthenticated ? (
          <AuthAccountFooter email={user?.email} onSignOut={handleSignOut} />
        ) : authMode === 'signin' ? (
          <>
            Need to create an account?{' '}
            <button
              type="button"
              onClick={() => {
                setError(null)
                setAuthMode('signup')
              }}
              className={authLinkClassName}
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
              className={authLinkClassName}
            >
              Sign in
            </button>
          </>
        )
      }
    >
      <AuthHeader title="You've been invited" />

      {/* Who invited you, to which organization, with what role */}
      <dl className="divide-y rounded-lg border text-[13px] leading-5">
        <InviteFact label="Organization">
          <Avatar className="h-5 w-5 rounded-[5px] border">
            <AvatarImage src={org.logo || undefined} alt="" />
            <AvatarFallback className="rounded-[5px] font-mono text-[10px] font-medium text-muted-foreground">
              {getInitials(org.name)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate font-medium">{org.name}</span>
        </InviteFact>
        <InviteFact label="Invited by">
          <Avatar className="h-5 w-5 rounded-[5px] border">
            <AvatarImage src={inviter.image || undefined} alt="" />
            <AvatarFallback className="rounded-[5px] font-mono text-[10px] font-medium text-muted-foreground">
              {getInitials(inviter.name)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate" title={inviter.email}>
            {inviter.name}
          </span>
        </InviteFact>
        <InviteFact label="Your role">
          <Badge variant="neutral" className="capitalize">
            {invitation.role}
          </Badge>
        </InviteFact>
        <InviteFact label="Sent to">
          <span className="truncate font-mono text-xs">{invitation.email}</span>
        </InviteFact>
        {expiresAt ? (
          <InviteFact label="Expires">
            <span className="font-mono text-xs text-muted-foreground">{expiresAt}</span>
          </InviteFact>
        ) : null}
      </dl>

      {/* Email mismatch warning */}
      {emailMismatch && (
        <div className="mt-4 rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2.5 text-[13px] leading-5">
          <p className="font-medium text-status-warning">Email mismatch</p>
          <p className="text-muted-foreground">
            This invitation was sent to{' '}
            <span className="font-medium text-foreground">{invitation.email}</span>, but you're
            signed in as <span className="font-medium text-foreground">{user?.email}</span>. Sign
            out and use the invited account to accept it.
          </p>
        </div>
      )}

      {error ? <AuthError className="mt-4">{error}</AuthError> : null}

      {/* Actions based on auth state */}
      {isAuthenticated ? (
        <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
          <Button variant="outline" className="h-9" onClick={handleReject} disabled={isProcessing}>
            {isProcessing && rejectInvitation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Decline
          </Button>
          <Button className="h-9" onClick={handleAccept} disabled={isProcessing || !!emailMismatch}>
            {isProcessing && acceptInvitation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Accept invitation
          </Button>
        </div>
      ) : (
        // Not logged in - allow social auth and email/password fallback
        <div className="mt-5">
          <SocialAuthButtons
            onSelect={(provider) => void handleSocialAuth(provider)}
            disabled={socialProviderLoading !== null}
            loadingProvider={socialProviderLoading}
          />

          <AuthDivider />

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
        </div>
      )}
    </AuthLayout>
  )
}

function InviteFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-2">{children}</dd>
    </div>
  )
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

function formatInvitationDate(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Turn the invitation API's error into a fact and a next step. */
function describeInvitationProblem(message: string | undefined): {
  title: string
  description: string
} {
  const askAgain = 'Ask whoever invited you to send a new one.'

  if (!message || /not found/i.test(message)) {
    return {
      title: 'Invitation not found',
      description: `This link may be mistyped, or the invitation was revoked. ${askAgain}`,
    }
  }
  if (/expired/i.test(message)) {
    return { title: 'Invitation expired', description: askAgain }
  }
  const used = message.match(/already been (\w+)/i)
  if (used) {
    return {
      title: `Invitation already ${used[1].toLowerCase()}`,
      description:
        used[1].toLowerCase() === 'accepted' ? 'Sign in to open the organization.' : askAgain,
    }
  }
  return { title: 'Invitation unavailable', description: message }
}
