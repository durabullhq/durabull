import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { useNavigate, useParams } from '@tanstack/react-router'
import { AlertCircle, Building2, Check, ChevronsUpDown, Loader2, Plus, X } from 'lucide-react'
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

/**
 * Generate a color class based on organization name (consistent colors)
 */
function getOrgColor(name: string): string {
  const colors = [
    'bg-status-priority/15 text-status-priority',
    'bg-status-active/15 text-status-active',
    'bg-status-success/15 text-status-success',
    'bg-status-warning/15 text-status-warning',
    'bg-status-delayed/15 text-status-delayed',
    'bg-signal/15 text-signal',
  ]
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[hash % colors.length]
}

interface OrganizationAvatarProps {
  organization: Organization
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function OrganizationAvatar({ organization, size = 'md', className }: OrganizationAvatarProps) {
  const sizeClasses = {
    sm: 'h-5 w-5 text-xs',
    md: 'h-7 w-7 text-sm',
    lg: 'h-9 w-9 text-base',
  }

  if (organization.logo) {
    return (
      <img
        src={organization.logo}
        alt={organization.name}
        className={cn('rounded-md object-cover', sizeClasses[size], className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-md border border-border/60 font-mono font-medium',
        sizeClasses[size],
        getOrgColor(organization.name),
        className
      )}
    >
      {getOrgInitials(organization.name)}
    </div>
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Create New Organization
          </DialogTitle>
          <DialogDescription>
            Create a new organization to manage your queues and team members.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              type="text"
              placeholder="My Company"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-slug">Organization URL</Label>
            <div className="relative">
              <Input
                id="org-slug"
                type="text"
                placeholder="my-company"
                value={formData.slug}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                  })
                }
                disabled={isSubmitting}
                className={cn(
                  'pr-10',
                  slugAvailable === true &&
                    'border-status-success/30 focus-visible:ring-status-success',
                  slugAvailable === false && 'border-destructive focus-visible:ring-destructive'
                )}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {isCheckingSlug && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {!isCheckingSlug && slugAvailable === true && (
                  <Check className="h-4 w-4 text-status-success" />
                )}
                {!isCheckingSlug && slugAvailable === false && (
                  <X className="h-4 w-4 text-destructive" />
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This will be used in your organization's URL:{' '}
              <span className="font-mono">/{formData.slug || 'my-company'}</span>
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
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
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create Organization
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
      <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-sidebar-accent/30 px-3 py-2.5">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
        <div className="flex-1 space-y-1">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2.5">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <span className="text-sm text-destructive">Failed to load</span>
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
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border bg-sidebar-accent/30 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-sidebar-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          <span>Create organization</span>
        </button>
        <CreateOrganizationDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
      </>
    )
  }

  // No current org found (fallback to first)
  const displayOrg = currentOrg || organizations[0]

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          data-testid="org-selector"
          className={cn(
            'w-full outline-none ring-ring transition-colors focus-visible:ring-2',
            compact
              ? 'bg-transparent text-sidebar-foreground data-[state=open]:bg-transparent'
              : 'rounded-lg border border-border/50 bg-sidebar-accent/30 hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent'
          )}
        >
          <div
            className={cn('flex items-center', compact ? 'gap-2.5 px-0 py-0' : 'gap-3 px-3 py-2.5')}
          >
            <OrganizationAvatar organization={displayOrg} size={compact ? 'md' : 'md'} />
            <div className="flex-1 text-left min-w-0">
              <div
                className={cn(
                  'truncate text-sidebar-foreground',
                  compact ? 'text-sm font-semibold' : 'text-sm font-medium'
                )}
              >
                {displayOrg.name}
              </div>
              {!compact && (
                <div className="truncate text-xs text-muted-foreground">
                  {organizations.length} organization{organizations.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            {isSwitching ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72" align="start" side="bottom" sideOffset={4}>
          <DropdownMenuLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Organizations
          </DropdownMenuLabel>
          <DropdownMenuGroup>
            {organizations.map((org) => {
              const isCurrentOrg = currentOrg?.id === org.id
              const isSwitchingToThis = switchingToOrgId === org.id

              return (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleSelectOrganization(org)}
                  className={cn('cursor-pointer gap-3 py-2.5', isCurrentOrg && 'bg-accent')}
                  disabled={isSwitching}
                >
                  <OrganizationAvatar organization={org} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{org.name}</div>
                    <div className="truncate text-xs text-muted-foreground">/{org.slug}</div>
                  </div>
                  {isSwitchingToThis ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  ) : isCurrentOrg ? (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  ) : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsCreateDialogOpen(true)}
            className="cursor-pointer gap-3 py-2.5 text-primary focus:text-primary"
            disabled={isSwitching}
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-dashed border-current">
              <Plus className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Create organization</div>
              <div className="text-xs text-muted-foreground">Start a new workspace</div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrganizationDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
    </>
  )
}
