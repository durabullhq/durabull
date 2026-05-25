import { organization } from '@durabull/auth/client'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { AlertCircle, Building2, Check, Loader2, LogOut, Mail, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DurabullLogo, DurabullWordmark } from '@/components/durabull-logo'
import { ElectronTitleBarDragStrip } from '@/components/electron-title-bar-drag-strip'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <ElectronTitleBarDragStrip />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    )
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

      await setActiveOrganization.mutateAsync(acceptedOrg.id)

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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ElectronTitleBarDragStrip />
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        {/* Subtle background pattern */}
        <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),transparent)]" />

        <Card className="w-full max-w-lg border-border bg-card p-8">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center">
            <div className="flex items-center gap-2">
              <DurabullLogo className="h-10 w-10 text-primary" />
              <DurabullWordmark className="h-6" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-foreground">Set Up Your Organization</h1>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {user?.name ? `Welcome, ${user.name}!` : 'Welcome!'} Create or join an organization to
              get started.
            </p>
          </div>

          {/* Pending Invitations */}
          {hasInvitations && (
            <>
              <div className="mb-6">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Mail className="h-5 w-5" />
                  Pending Invitations
                </h2>
                <div className="space-y-3">
                  {invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-4"
                    >
                      <div>
                        <p className="font-medium text-foreground">Organization Invitation</p>
                        <p className="text-sm text-muted-foreground">
                          Invited as {invitation.role}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRejectInvitation(invitation.id)}
                          disabled={rejectInvitation.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleAcceptInvitation(invitation.id)}
                          disabled={acceptInvitation.isPending}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Accept
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative my-6">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  OR
                </span>
              </div>
            </>
          )}

          {/* Create Organization Form */}
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Building2 className="h-5 w-5" />
              Create New Organization
            </h2>

            <form onSubmit={handleCreateOrganization} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Organization Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="My Company"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={createOrganization.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Organization URL</Label>
                <div className="relative">
                  <Input
                    id="slug"
                    type="text"
                    placeholder="my-company"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                      })
                    }
                    disabled={createOrganization.isPending}
                    className={
                      slugAvailable === true
                        ? 'border-green-500 pr-10'
                        : slugAvailable === false
                          ? 'border-red-500 pr-10'
                          : 'pr-10'
                    }
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {isCheckingSlug && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {!isCheckingSlug && slugAvailable === true && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                    {!isCheckingSlug && slugAvailable === false && (
                      <X className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  This will be used in your organization's URL
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={createOrganization.isPending || slugAvailable === false || isCheckingSlug}
              >
                {createOrganization.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create Organization
              </Button>
            </form>
          </div>

          {/* Logout option */}
          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-center text-sm text-muted-foreground mb-3">
              Signed in as {user?.email}
            </p>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={() => signOut().then(() => navigate({ to: '/login' }))}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out and use a different account
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
