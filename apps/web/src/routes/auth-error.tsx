import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowRight, KeyRound, Link2, Mail } from 'lucide-react'
import { AuthLayout } from '@/components/auth-layout'
import { DurabullLogo, DurabullWordmark } from '@/components/durabull-logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// Search params for the auth error page
interface AuthErrorSearch {
  reason?: 'account-exists' | 'link-failed' | string
  provider?: string
}

export const Route = createFileRoute('/auth-error')({
  validateSearch: (search: Record<string, unknown>): AuthErrorSearch => ({
    reason: search.reason as string | undefined,
    provider: search.provider as string | undefined,
  }),
  component: AuthErrorPage,
})

function AuthErrorPage() {
  const { reason, provider } = Route.useSearch()

  // Default to account-exists if no reason provided
  const errorReason = reason || 'account-exists'
  const providerName = provider ? capitalizeFirst(provider) : 'social'

  return (
    <AuthLayout>
      <div className="flex min-h-screen items-center justify-center p-4 pt-24">
        <Card className="w-full max-w-lg border-border bg-card p-8">
          {/* Logo */}
          <div className="mb-6 flex flex-col items-center">
            <div className="flex items-center gap-2">
              <DurabullLogo className="h-10 w-10 text-primary" />
              <DurabullWordmark className="h-6" />
            </div>
          </div>

          {errorReason === 'account-exists' ? (
            <AccountExistsError providerName={providerName} />
          ) : (
            <GenericError reason={errorReason} />
          )}
        </Card>
      </div>
    </AuthLayout>
  )
}

function AccountExistsError({ providerName }: { providerName: string }) {
  return (
    <>
      {/* Error Icon */}
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-status-warning/10">
        <AlertTriangle className="h-8 w-8 text-status-warning" />
      </div>

      {/* Error Message */}
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-xl font-semibold">Account Already Exists</h1>
        <p className="text-muted-foreground">
          An account with this email address already exists. To use {providerName} sign-in, you'll
          need to link it to your existing account.
        </p>
      </div>

      {/* Steps */}
      <div className="mb-8 space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          How to link your account
        </h2>

        <div className="space-y-3">
          <Step
            number={1}
            icon={KeyRound}
            title="Sign in with your password"
            description="Use your email and password to access your account"
          />
          <Step
            number={2}
            icon={Link2}
            title="Go to Settings"
            description="Navigate to Settings from the user menu"
          />
          <Step
            number={3}
            icon={Mail}
            title="Link your account"
            description={`Click "Link ${providerName} Account" in the Authentication section`}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        <Button asChild className="w-full">
          <Link to="/login">
            <KeyRound className="mr-2 h-4 w-4" />
            Sign in with Password
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{' '}
          <Link
            to="/signup"
            className="font-medium text-foreground hover:text-foreground/80 underline underline-offset-4"
          >
            Sign up
          </Link>
        </p>
      </div>
    </>
  )
}

function GenericError({ reason }: { reason: string }) {
  return (
    <>
      {/* Error Icon */}
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>

      {/* Error Message */}
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-xl font-semibold">Authentication Error</h1>
        <p className="text-muted-foreground">
          Something went wrong during authentication. Please try again.
        </p>
        {reason && <p className="mt-2 text-xs text-muted-foreground font-mono">Error: {reason}</p>}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        <Button asChild className="w-full">
          <Link to="/login">
            <ArrowRight className="mr-2 h-4 w-4" />
            Back to Login
          </Link>
        </Button>
      </div>
    </>
  )
}

function Step({
  number,
  icon: Icon,
  title,
  description,
}: {
  number: number
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
        {number}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <p className="font-medium text-sm">{title}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  )
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
