import { AnalyticsEvents, AuthMethod, trackEvent } from '@durabull/analytics'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { AlertCircle, Github, Loader2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { AuthLayout } from '@/components/auth-layout'
import { DurabullLogo, DurabullWordmark } from '@/components/durabull-logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useAppConfig } from '@/hooks/use-app-config'
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
  const { config: appConfig } = useAppConfig()
  const oauthProviders = appConfig.oauthProviders
  const showSocialBlock = oauthProviders.google || oauthProviders.github
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
    return (
      <AuthLayout>
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AuthLayout>
    )
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
    <AuthLayout>
      <div className="flex min-h-screen items-center justify-center p-4 pt-24">
        <Card className="w-full max-w-md border-border bg-card p-8">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center">
            <div className="flex items-center gap-2">
              <DurabullLogo className="h-10 w-10 text-primary" />
              <DurabullWordmark className="h-6" />
            </div>
            <p className="mt-4 text-center text-sm text-muted-foreground">Create your account</p>
          </div>

          {showSocialBlock && (
            <>
              {/* Social Login Buttons */}
              <div className="space-y-3">
                {oauthProviders.google && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading}
                  >
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
                    Continue with Google
                  </Button>
                )}

                {oauthProviders.github && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleGitHubSignIn}
                    disabled={isLoading}
                  >
                    <Github className="mr-2 h-4 w-4" />
                    Continue with GitHub
                  </Button>
                )}
              </div>

              <div className="relative my-6">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  OR
                </span>
              </div>
            </>
          )}

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="signup-form">
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
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                disabled={isLoading}
              />
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

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              Create Account
            </Button>
          </form>

          {/* Link to Sign In */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            {invitationId ? (
              <Link
                to="/login"
                search={{ invitationId }}
                className="font-medium text-foreground hover:text-foreground/80 underline underline-offset-4"
              >
                Sign in
              </Link>
            ) : (
              <Link
                to="/login"
                className="font-medium text-foreground hover:text-foreground/80 underline underline-offset-4"
              >
                Sign in
              </Link>
            )}
          </p>
        </Card>
      </div>
    </AuthLayout>
  )
}
