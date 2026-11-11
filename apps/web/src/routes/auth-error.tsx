import { createFileRoute, Link } from '@tanstack/react-router'
import { ShieldAlert, UserRoundCheck } from 'lucide-react'
import { AuthLayout, authLinkClassName } from '@/components/auth-layout'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

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
    <AuthLayout
      footer={
        errorReason === 'account-exists' ? (
          <>
            Don't have an account?{' '}
            <Link to="/signup" className={authLinkClassName}>
              Sign up
            </Link>
          </>
        ) : undefined
      }
    >
      {errorReason === 'account-exists' ? (
        <AccountExistsError providerName={providerName} />
      ) : (
        <GenericError reason={errorReason} />
      )}
    </AuthLayout>
  )
}

function AccountExistsError({ providerName }: { providerName: string }) {
  const steps = [
    'Sign in with your email and password.',
    'Open Settings → Authentication.',
    `Next to ${providerName}, choose "Link account".`,
  ]

  return (
    <EmptyState
      size="inline"
      tone="warning"
      icon={UserRoundCheck}
      title="This email already has an account"
      description={`${providerName} sign-in isn't linked to it yet. Link it once and you can use either method.`}
      className="px-0 py-2"
    >
      <ol className="mt-5 w-full divide-y rounded-lg border text-left">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-3 px-3 py-2.5 text-[13px] leading-5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-[11px] text-muted-foreground">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <Button asChild className="mt-5 h-9 w-full">
        <Link to="/login">Sign in with password</Link>
      </Button>
    </EmptyState>
  )
}

function GenericError({ reason }: { reason: string }) {
  return (
    <EmptyState
      size="inline"
      tone="danger"
      icon={ShieldAlert}
      title="Sign-in didn't complete"
      description="Something went wrong while authenticating. Try again, or use a different sign-in method."
      className="px-0 py-2"
    >
      {reason ? (
        <p className="mt-3 max-w-full break-all rounded-md border bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
          {reason}
        </p>
      ) : null}
      <Button asChild className="mt-5 h-9 w-full">
        <Link to="/login">Back to sign in</Link>
      </Button>
    </EmptyState>
  )
}

const PROVIDER_NAMES: Record<string, string> = { github: 'GitHub', google: 'Google' }

function capitalizeFirst(str: string): string {
  return PROVIDER_NAMES[str.toLowerCase()] ?? str.charAt(0).toUpperCase() + str.slice(1)
}
