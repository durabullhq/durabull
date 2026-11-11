import { organization } from '@durabull/auth/client'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Check, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AuthAccountFooter,
  AuthDivider,
  AuthError,
  AuthField,
  AuthHeader,
  AuthLayout,
  AuthLoading,
} from '@/components/auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/use-auth'
import {
  organizationKeys,
  useAcceptInvitation,
  useCheckSlug,
  useCreateOrganization,
  useOrganizations,
  usePendingInvitations,
  useRejectInvitation,
  useSetActiveOrganization,
} from '@/hooks/use-organization'
import { api, type InferResponseType } from '@/lib/api'
import { cn } from '@/lib/utils'

type AppConfigResponse = InferResponseType<(typeof api.app.config)['$get'], 200>

export const Route = createFileRoute('/setup-organization')({
  beforeLoad: async ({ context }) => {
    // Check if we should skip this page (e.g., after accepting an invite)
    // This prevents the brief flash of this page when navigating from invite acceptance
    if (typeof window !== 'undefined') {
      const skipOrgSetup = sessionStorage.getItem('skipOrgSetup')
      if (skipOrgSetup) {
        // Clear the flag
        sessionStorage.removeItem('skipOrgSetup')
        // Redirect to home - the user should already have an org from accepting the invite
        throw redirect({ to: '/' })
      }
    }

    const config = await context.queryClient.ensureQueryData({
      queryKey: ['app-config'],
      queryFn: async (): Promise<AppConfigResponse> => {
        const response = await api.app.config.$get()
        if (!response.ok) {
          throw new Error(`Failed to fetch app config: ${response.status}`)
        }
        return response.json()
      },
      staleTime: 5 * 60 * 1000,
    })

    if (config.authless) {
      throw redirect({ to: '/' })
    }

    // Check if user already has organizations - if so, set active and redirect
    const organizations = await context.queryClient.ensureQueryData({
      queryKey: organizationKeys.list(),
      queryFn: async () => {
        const result = await organization.list()
        if (result.error) {
          // User might not be authenticated - let component handle it
          return []
        }
        return result.data ?? []
      },
      staleTime: 30000,
    })

    if (organizations.length > 0) {
      const firstOrg = organizations[0]
      // Set the first org as active
      await organization.setActive({ organizationId: firstOrg.id })
      // Invalidate queries and redirect
      context.queryClient.invalidateQueries({ queryKey: organizationKeys.active })
      throw redirect({ to: '/$orgSlug', params: { orgSlug: firstOrg.slug } })
    }
  },
  component: SetupOrganizationPage,
})

function SetupOrganizationPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAuthenticated, isLoading: sessionLoading, user, signOut } = useAuth()

  const { isLoading: orgsLoading } = useOrganizations()
  const { data: invitations, isLoading: invitationsLoading } = usePendingInvitations()

  const createOrganization = useCreateOrganization()
  const setActiveOrganization = useSetActiveOrganization()
  const acceptInvitation = useAcceptInvitation()
  const rejectInvitation = useRejectInvitation()
  const checkSlug = useCheckSlug()

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [isCheckingSlug, setIsCheckingSlug] = useState(false)

  // Ref to hold the checkSlug mutation to avoid dependency issues
  const checkSlugRef = useRef(checkSlug)
  checkSlugRef.current = checkSlug

  // Stable callback for checking slug
  const checkSlugAvailability = useCallback(async (slug: string) => {
    setIsCheckingSlug(true)
    try {
      const result = await checkSlugRef.current.mutateAsync(slug)
      // Better Auth returns { status: true } when slug is AVAILABLE (doesn't exist)
      // and throws an error when slug is TAKEN
      setSlugAvailable(result?.status === true)
    } catch {
      // Error means slug is taken or API error
      setSlugAvailable(false)
    } finally {
      setIsCheckingSlug(false)
    }
  }, [])

  // Auto-generate slug from name
  useEffect(() => {
    if (formData.name) {
      const slug = formData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      setFormData((prev) => ({ ...prev, slug }))
      setSlugAvailable(null)
    }
  }, [formData.name])

  // Check slug availability when it changes (debounced)
  useEffect(() => {
    if (!formData.slug || formData.slug.length < 3) {
      setSlugAvailable(null)
      return
    }

    const timer = setTimeout(() => {
      checkSlugAvailability(formData.slug)
    }, 500)

    return () => clearTimeout(timer)
  }, [formData.slug, checkSlugAvailability])

  // Redirect to login if not authenticated
  if (!sessionLoading && !isAuthenticated) {
    navigate({ to: '/login' })
    return null
  }

  if (sessionLoading || orgsLoading || invitationsLoading) {
    return <AuthLoading />
  }

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.name.trim()) {
      setError('Organization name is required')
      return
    }

    if (!formData.slug.trim() || formData.slug.length < 3) {
      setError('Organization URL must be at least 3 characters')
      return
    }

    if (slugAvailable === false) {
      setError('This URL is already taken')
      return
    }

    try {
      const result = await createOrganization.mutateAsync({
        name: formData.name.trim(),
        slug: formData.slug.trim(),
      })

      if (result?.id) {
        // Set the new organization as active
        await setActiveOrganization.mutateAsync(result.id)
        navigate({ to: '/' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    }
  }

  const handleAcceptInvitation = async (invitationId: string) => {
    try {
      const invitation = invitations?.find((inv) => inv.id === invitationId)
      await acceptInvitation.mutateAsync(invitationId)

      // The accept mutation invalidates the org list cache but doesn't await
      // a refetch. Pull a fresh list here so we can resolve the slug and set
      // the org active before navigating, otherwise the index route reads
      // stale data and bounces back to /setup-organization.
      const orgsResult = await organization.list()
      const orgs = orgsResult.data ?? []
      const acceptedOrg = invitation
        ? orgs.find((o) => o.id === invitation.organizationId)
        : undefined

      if (!acceptedOrg) {
        // Fall back to the index route, which will re-resolve once caches refresh.
        navigate({ to: '/' })
        return
      }

      const setActiveResult = await organization.setActive({
        organizationId: acceptedOrg.id,
      })
      if (setActiveResult.error) {
        throw new Error(setActiveResult.error.message ?? 'Failed to activate organization')
      }
      queryClient.invalidateQueries({ queryKey: organizationKeys.active })
      queryClient.invalidateQueries({ queryKey: organizationKeys.list() })

      navigate({ to: '/$orgSlug', params: { orgSlug: acceptedOrg.slug } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation')
    }
  }

  const handleRejectInvitation = async (invitationId: string) => {
    try {
      await rejectInvitation.mutateAsync(invitationId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject invitation')
    }
  }

  const hasInvitations = invitations && invitations.length > 0

  const slugTooShort = formData.slug.length > 0 && formData.slug.length < 3

  return (
    <AuthLayout
      footer={
        <AuthAccountFooter
          email={user?.email}
          onSignOut={() => signOut().then(() => navigate({ to: '/login' }))}
        />
      }
    >
      <AuthHeader
        title="Set up your organization"
        description={
          hasInvitations
            ? 'Join an organization you were invited to, or create a new one.'
            : 'An organization holds your Redis connections, alert rules, and teammates.'
        }
      />

      {/* Pending Invitations */}
      {hasInvitations && (
        <>
          <section aria-labelledby="pending-invitations-heading">
            <h2 id="pending-invitations-heading" className="eyebrow mb-1.5">
              Pending invitations
            </h2>
            <ul className="divide-y rounded-lg border">
              {invitations.map((invitation) => {
                const organizationName = (invitation as { organizationName?: string })
                  .organizationName

                return (
                  <li key={invitation.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium leading-5">
                        {organizationName ?? 'Organization invitation'}
                      </p>
                      <p className="text-xs leading-4 text-muted-foreground">
                        Invited as <span className="capitalize">{invitation.role}</span>
                      </p>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => handleRejectInvitation(invitation.id)}
                      disabled={rejectInvitation.isPending}
                    >
                      Decline
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => handleAcceptInvitation(invitation.id)}
                      disabled={acceptInvitation.isPending}
                    >
                      Accept
                    </Button>
                  </li>
                )
              })}
            </ul>
          </section>

          <AuthDivider />
        </>
      )}

      {/* Create Organization Form */}
      <form onSubmit={handleCreateOrganization} className="space-y-4">
        <AuthField id="name" label="Organization name">
          <Input
            id="name"
            type="text"
            autoComplete="organization"
            placeholder="Acme Inc."
            className="h-9"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            disabled={createOrganization.isPending}
            autoFocus={!hasInvitations}
          />
        </AuthField>

        <AuthField
          id="slug"
          label="URL"
          hint={
            <span aria-live="polite">
              {isCheckingSlug ? (
                'Checking availability…'
              ) : slugAvailable === true ? (
                <span className="text-status-success">Available.</span>
              ) : slugAvailable === false ? (
                <span className="text-status-danger">Already taken. Try another.</span>
              ) : slugTooShort ? (
                'At least 3 characters.'
              ) : (
                'Lowercase letters, numbers, and hyphens. Appears in every link to this organization.'
              )}
            </span>
          }
        >
          <div className="relative">
            <span
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-faint"
              aria-hidden
            >
              /
            </span>
            <Input
              id="slug"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="acme"
              value={formData.slug}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                })
              }
              disabled={createOrganization.isPending}
              className={cn(
                'h-9 pl-5 pr-9 font-mono',
                slugAvailable === true && 'border-status-success/40',
                slugAvailable === false && 'border-status-danger/50'
              )}
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
              {isCheckingSlug && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
              )}
              {!isCheckingSlug && slugAvailable === true && (
                <Check className="h-4 w-4 text-status-success" aria-hidden />
              )}
              {!isCheckingSlug && slugAvailable === false && (
                <X className="h-4 w-4 text-status-danger" aria-hidden />
              )}
            </div>
          </div>
        </AuthField>

        {error ? <AuthError>{error}</AuthError> : null}

        <Button
          type="submit"
          variant={hasInvitations ? 'outline' : 'default'}
          className="h-9 w-full"
          disabled={createOrganization.isPending || slugAvailable === false || isCheckingSlug}
        >
          {createOrganization.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          Create organization
        </Button>
      </form>
    </AuthLayout>
  )
}
