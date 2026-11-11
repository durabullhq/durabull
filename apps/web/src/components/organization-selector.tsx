import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Check, ChevronsUpDown, Loader2, Plus, Settings, Users, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  type Organization,
  useCheckSlug,
  useCreateOrganization,
  useOrganizations,
  useSetActiveOrganization,
} from '@/hooks/use-organization'
import { cn } from '@/lib/utils'

/**
 * Get initials from organization name for avatar fallback
 */
function getOrgInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

interface OrganizationAvatarProps {
  organization: Organization
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Organization mark: logo when there is one, otherwise initials on a neutral
 * tile. Colour is reserved for state, so organizations are told apart by name.
 */
function OrganizationAvatar({ organization, size = 'md', className }: OrganizationAvatarProps) {
  const sizeClasses = {
    sm: 'h-5 w-5 rounded-[5px] text-[10px]',
    md: 'h-6 w-6 rounded-md text-[11px]',
  }

  if (organization.logo) {
    return (
      <img
        src={organization.logo}
        alt=""
        className={cn('shrink-0 border object-cover', sizeClasses[size], className)}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center border bg-muted font-mono font-medium leading-none text-muted-foreground',
        sizeClasses[size],
        className
      )}
    >
      {getOrgInitials(organization.name)}
    </span>
  )
}

/**
 * Create Organization Dialog
 * A modal for creating a new organization without leaving the current page
 */
interface CreateOrganizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (org: Organization) => void
}

function CreateOrganizationDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateOrganizationDialogProps) {
  const createOrganization = useCreateOrganization()
  const setActiveOrganization = useSetActiveOrganization()
  const checkSlug = useCheckSlug()
  const navigate = useNavigate()

  const [formData, setFormData] = useState({ name: '', slug: '' })
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
      setSlugAvailable(result?.status === true)
    } catch {
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

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFormData({ name: '', slug: '' })
      setError(null)
      setSlugAvailable(null)
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
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
        onOpenChange(false)

        if (onSuccess) {
          onSuccess(result as Organization)
        } else {
          // Navigate to the new organization
          navigate({ to: '/$orgSlug', params: { orgSlug: result.slug } })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    }
  }

  const isSubmitting = createOrganization.isPending || setActiveOrganization.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (newOpen) {
          trackEvent(AnalyticsEvents.DIALOG_OPENED, {
            [AnalyticsProperties.DIALOG_TYPE]: DialogType.CREATE_ORGANIZATION,
          })
        } else {
          trackEvent(AnalyticsEvents.DIALOG_CLOSED, {
            [AnalyticsProperties.DIALOG_TYPE]: DialogType.CREATE_ORGANIZATION,
          })
        }
        onOpenChange(newOpen)
      }}
    >
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            A separate workspace with its own connections, alert rules, and members.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="org-name" className="text-[13px]">
              Organization name
            </Label>
            <Input
              id="org-name"
              type="text"
              placeholder="Acme Inc."
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="org-slug" className="text-[13px]">
              URL
            </Label>
            <div className="relative">
              <span
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-faint"
                aria-hidden
              >
                /
              </span>
              <Input
                id="org-slug"
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
                disabled={isSubmitting}
                className={cn(
                  'pl-5 pr-9 font-mono',
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
            <p className="text-xs leading-4 text-muted-foreground" aria-live="polite">
              {isCheckingSlug ? (
                'Checking availability…'
              ) : slugAvailable === true ? (
                <span className="text-status-success">Available.</span>
              ) : slugAvailable === false ? (
                <span className="text-status-danger">Already taken. Try another.</span>
              ) : (
                'Lowercase letters, numbers, and hyphens. Appears in every link to this organization.'
              )}
            </p>
          </div>

          {error && (
            <p role="alert" className="text-[13px] leading-5 text-status-danger">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting || slugAvailable === false || isCheckingSlug || !formData.name.trim()
              }
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Create organization
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Organization Selector Component
 * A dropdown for selecting and switching between organizations,
 * with the ability to create new organizations.
 */
interface OrganizationSelectorProps {
  compact?: boolean
}

export function OrganizationSelector({ compact = false }: OrganizationSelectorProps) {
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const orgSlug = (params as { orgSlug?: string }).orgSlug

  const { data: organizations, isLoading, error } = useOrganizations()
  const setActiveOrganization = useSetActiveOrganization()

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [switchingToOrgId, setSwitchingToOrgId] = useState<string | null>(null)

  // Find current organization by slug
  const currentOrg = organizations?.find((org) => org.slug === orgSlug)

  const handleSelectOrganization = async (org: Organization) => {
    if (org.id === currentOrg?.id) return

    setSwitchingToOrgId(org.id)
    try {
      await setActiveOrganization.mutateAsync(org.id)
      // Navigate to the new organization's dashboard
      navigate({ to: '/$orgSlug', params: { orgSlug: org.slug } })
    } catch (err) {
      console.error('Failed to switch organization:', err)
    } finally {
      setSwitchingToOrgId(null)
    }
  }

  const isSwitching = switchingToOrgId !== null

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex h-8 items-center gap-2', compact ? 'px-1.5' : 'px-2')}>
        <div className="h-5 w-5 shrink-0 animate-pulse rounded-[5px] bg-muted" />
        <div className="h-3 w-24 animate-pulse rounded-sm bg-muted" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div
        role="alert"
        className={cn(
          'flex h-8 items-center text-[13px] text-status-danger',
          compact ? 'px-1.5' : 'px-2'
        )}
      >
        Organizations failed to load
      </div>
    )
  }

  // No organizations state (shouldn't normally happen in the app)
  if (!organizations || organizations.length === 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsCreateDialogOpen(true)}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-dashed px-2 text-[13px] text-muted-foreground transition-colors hover:border-border-strong hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          <span>Create organization</span>
        </button>
        <CreateOrganizationDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
      </>
    )
  }

  // No current org found (fallback to first)
  const displayOrg = currentOrg || organizations[0]
  const settingsSlug = displayOrg.slug

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          data-testid="org-selector"
          aria-label={`Organization: ${displayOrg.name}. Switch organization`}
          className={cn(
            'group flex h-8 w-full min-w-0 items-center gap-2 rounded-md text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-sidebar-accent',
            compact ? 'px-1.5' : 'border bg-card px-2 shadow-xs hover:border-border-strong'
          )}
        >
          <OrganizationAvatar organization={displayOrg} size="sm" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight text-foreground">
            {displayOrg.name}
          </span>
          {isSwitching ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-faint" aria-hidden />
          ) : (
            <ChevronsUpDown
              className="h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-muted-foreground"
              aria-hidden
            />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60" align="start" side="bottom" sideOffset={6}>
          <DropdownMenuLabel className="eyebrow text-[10px]">Organizations</DropdownMenuLabel>
          <DropdownMenuGroup>
            {organizations.map((org) => {
              const isCurrentOrg = currentOrg?.id === org.id
              const isSwitchingToThis = switchingToOrgId === org.id

              return (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleSelectOrganization(org)}
                  disabled={isSwitching}
                  aria-current={isCurrentOrg ? 'true' : undefined}
                  title={`/${org.slug}`}
                >
                  <OrganizationAvatar organization={org} size="sm" />
                  <span className={cn('min-w-0 flex-1 truncate', isCurrentOrg && 'font-medium')}>
                    {org.name}
                  </span>
                  {isSwitchingToThis ? (
                    <Loader2 className="animate-spin text-muted-foreground" aria-hidden />
                  ) : isCurrentOrg ? (
                    <Check className="text-foreground" aria-hidden />
                  ) : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIsCreateDialogOpen(true)} disabled={isSwitching}>
            <Plus className="text-muted-foreground" aria-hidden />
            Create organization
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              navigate({ to: '/$orgSlug/settings/team', params: { orgSlug: settingsSlug } })
            }
          >
            <Users className="text-muted-foreground" aria-hidden />
            Team
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              navigate({ to: '/$orgSlug/settings', params: { orgSlug: settingsSlug } })
            }
          >
            <Settings className="text-muted-foreground" aria-hidden />
            Organization settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrganizationDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
    </>
  )
}
