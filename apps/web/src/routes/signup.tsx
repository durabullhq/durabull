import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AuthMethod } from '@durabull/analytics/events'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import {
  AuthDivider,
  AuthError,
  AuthField,
  AuthHeader,
  AuthLayout,
  AuthLoading,
  authLinkClassName,
  SocialAuthButtons,
} from '@/components/auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getAuthErrorMessage, useAuth } from '@/hooks/use-auth'

interface SignupSearch {
  invitationId?: string
}

export const Route = createFileRoute('/signup')({
  validateSearch: (search: Record<string, unknown>): SignupSearch => ({
    invitationId:
      typeof search.invitationId === 'string' && search.invitationId.length > 0
        ? search.invitationId
        : undefined,
  }),
  component: SignupPage,
})

function SignupPage() {
  const { invitationId } = Route.useSearch()
  const navigate = useNavigate()
  const { signIn, signUp, isLoading: sessionLoading, refetch } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const invitationPath = invitationId ? `/invite/${invitationId}` : null
  const postSignUpPath = invitationPath ?? '/setup-organization'

  const getOAuthCallbackURL = () => {
    if (typeof window === 'undefined') return undefined
    const callbackPath = invitationPath ?? postSignUpPath
    return `${window.location.origin}${callbackPath}`
  }

  const navigateAfterSignUp = () => {
    if (invitationId) {
      navigate({ to: '/invite/$invitationId', params: { invitationId } })
      return
    }
    navigate({ to: '/setup-organization' })
  }

  // Redirect if already authenticated (handled by root layout)
  if (sessionLoading) {
    return <AuthLoading />
  }

  // Note: We don't redirect authenticated users here because
  // the root layout already handles that. If we redirect here,
  // it conflicts with the post-signup redirect to /setup-organization.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // Validate password match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    // Validate password length
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters')
      setIsLoading(false)
      return
    }

    const result = await signUp.email({
      email: formData.email,
      password: formData.password,
      name: formData.name,
    })

    if (result.error) {
      trackEvent(AnalyticsEvents.USER_SIGNED_UP, {
        auth_method: AuthMethod.EMAIL,
        success: false,
      })
      setError(getAuthErrorMessage(result, 'Failed to create account'))
      setIsLoading(false)
      return
    }

    trackEvent(AnalyticsEvents.USER_SIGNED_UP, {
      auth_method: AuthMethod.EMAIL,
      success: true,
    })

    // Refetch session - better-auth auto-logs in after signup
    await refetch()
    // Redirect to organization setup - new users need to create/join an organization
    navigateAfterSignUp()
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setError(null)

    trackEvent(AnalyticsEvents.USER_SIGNED_UP, {
      auth_method: AuthMethod.GOOGLE,
      success: true, // OAuth redirects, so we track the attempt
    })

    const callbackURL = getOAuthCallbackURL()

    const result = await signIn.social({
      provider: 'google',
      requestSignUp: true,
      ...(callbackURL
        ? {
            callbackURL,
            newUserCallbackURL: callbackURL,
          }
        : {}),
    })

    if (result?.error) {
      const errorMessage = getAuthErrorMessage(result, 'Failed to sign in with Google')

      // If the account already exists with a different provider, redirect to error page
      if (errorMessage === 'ACCOUNT_EXISTS') {
        navigate({ to: '/auth-error', search: { reason: 'account-exists', provider: 'google' } })
        return
      }

      setError(errorMessage)
      setIsLoading(false)
    }
  }

  const handleGitHubSignIn = async () => {
    setIsLoading(true)
    setError(null)

    trackEvent(AnalyticsEvents.USER_SIGNED_UP, {
      auth_method: AuthMethod.GITHUB,
      success: true, // OAuth redirects, so we track the attempt
    })

    const callbackURL = getOAuthCallbackURL()

    const result = await signIn.social({
      provider: 'github',
      requestSignUp: true,
      ...(callbackURL
        ? {
            callbackURL,
            newUserCallbackURL: callbackURL,
          }
        : {}),
    })

    if (result?.error) {
      const errorMessage = getAuthErrorMessage(result, 'Failed to sign in with GitHub')

      // If the account already exists with a different provider, redirect to error page
      if (errorMessage === 'ACCOUNT_EXISTS') {
        navigate({ to: '/auth-error', search: { reason: 'account-exists', provider: 'github' } })
        return
      }

      setError(errorMessage)
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout
      footer={
        <>
          Already have an account?{' '}
          {invitationId ? (
            <Link to="/login" search={{ invitationId }} className={authLinkClassName}>
              Sign in
            </Link>
          ) : (
            <Link to="/login" className={authLinkClassName}>
              Sign in
            </Link>
          )}
        </>
      }
    >
      <AuthHeader
        title="Create your account"
        description={invitationId ? 'Create an account to accept your invitation.' : undefined}
      />

      <SocialAuthButtons
        disabled={isLoading}
        onSelect={(provider) =>
          provider === 'google' ? void handleGoogleSignIn() : void handleGitHubSignIn()
        }
      />

      <AuthDivider />

      <form onSubmit={handleSubmit} className="space-y-4" data-testid="signup-form">
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
          />
        </AuthField>

        <AuthField id="email" label="Email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="h-9"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            disabled={isLoading}
          />
        </AuthField>

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

        {error ? <AuthError>{error}</AuthError> : null}

        <Button type="submit" className="h-9 w-full" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
