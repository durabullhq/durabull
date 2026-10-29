import { createFileRoute, Navigate, Outlet, useNavigate } from '@tanstack/react-router'
import { ShieldX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { TransitionBanner } from '@/components/billing/transition-banner'
import { UpgradePromptHost } from '@/components/billing/upgrade-prompt-host'
import { useAppMode } from '@/hooks/use-app-mode'
import { useAuth } from '@/hooks/use-auth'
import { useOrganizations, useSetActiveOrganization } from '@/hooks/use-organization'

export const Route = createFileRoute('/$orgSlug')({
  // Note: We intentionally don't use beforeLoad for auth calls here.
  // During SSR, the Better Auth client SDK doesn't have access to session cookies,
  // which causes 401 errors. Instead, we handle organization switching in the
  // component after hydration when the client has proper cookie access.
  component: OrgSlugLayout,
})

/**
 * Organization slug layout route.
 * Handles organization switching on the client side after hydration.
 * This avoids SSR auth issues where the Better Auth client SDK
 * doesn't have access to session cookies.
 */
function OrgSlugLayout() {
  const { orgSlug } = Route.useParams()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading, session } = useAuth()
  const { isAuthless } = useAppMode()
  const { data: organizations, isLoading: orgsLoading } = useOrganizations()
  const setActiveOrg = useSetActiveOrganization()

  // Track if we've already set the active org to prevent loops
  const hasSetActiveRef = useRef(false)

  // Find the organization by slug
  const org = organizations?.find((o) => o.slug === orgSlug)

  // Get current active org ID from session
  const activeOrgId = (session as { activeOrganizationId?: string })?.activeOrganizationId

  // Set the active organization when we have the data and it's different
  useEffect(() => {
    if (org && activeOrgId !== org.id && !hasSetActiveRef.current && !setActiveOrg.isPending) {
      hasSetActiveRef.current = true
      setActiveOrg.mutate(org.id, {
        onError: () => {
          // Reset on error so we can retry
          hasSetActiveRef.current = false
        },
      })
    }
  }, [org, activeOrgId, setActiveOrg])

  // Reset the ref when slug changes (orgSlug in deps is intentional)
  // biome-ignore lint/correctness/useExhaustiveDependencies: we intentionally reset when orgSlug changes
  useEffect(() => {
    hasSetActiveRef.current = false
  }, [orgSlug])

  // Show loading while checking auth or fetching organizations
  if (authLoading || orgsLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated && !isAuthless) {
    return <Navigate to="/login" replace />
  }

  // Organization not found or user doesn't have access - show 403
  if (!org) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <div className="text-center max-w-md">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-6">
            You don't have access to the organization "{orgSlug}". This could mean the organization
            doesn't exist or you haven't been invited.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: '/' })}
            className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    )
  }

  // Valid organization - render children
  return (
    <>
      <Outlet />
      <UpgradePromptHost orgSlug={orgSlug} />
      <TransitionBanner orgSlug={orgSlug} />
    </>
  )
}
