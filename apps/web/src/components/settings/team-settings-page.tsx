import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { Loader2, MoreHorizontal, Search, UserPlus, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  LocalInstallNotice,
  SettingsPage,
  useSettingsTopBar,
} from '@/components/settings/settings-layout'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Panel, PanelHeader, SectionHeader } from '@/components/ui/section'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAppMode } from '@/hooks/use-app-mode'
import { useAuth } from '@/hooks/use-auth'
import {
  type Invitation,
  MEMBER_ROLES,
  type MemberRole,
  type OrganizationMember,
  useActiveOrganization,
  useCancelInvitation,
  useInviteMember,
  useOrganizationInvitations,
  useOrganizationMembers,
  useRemoveMember,
  useResendInvitation,
  useUpdateMemberRole,
} from '@/hooks/use-organization'

const roles: { value: MemberRole; label: string; description: string }[] = [
  {
    value: MEMBER_ROLES.OWNER,
    label: 'Owner',
    description: 'Full access including billing and danger zone',
  },
  {
    value: MEMBER_ROLES.ADMIN,
    label: 'Admin',
    description: 'Can manage members and settings',
  },
  {
    value: MEMBER_ROLES.MEMBER,
    label: 'Member',
    description: 'Can view and use resources',
  },
]

const assignableRoles = roles.filter((role) => role.value !== MEMBER_ROLES.OWNER)

/** Members beyond this count get a search box above the table. */
const MEMBER_SEARCH_THRESHOLD = 8

function getRoleConfig(role: MemberRole) {
  return roles.find((r) => r.value === role) ?? roles[2]
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function MemberAvatar({ member }: { member: OrganizationMember }) {
  return (
    <Avatar className="border">
      <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
      <AvatarFallback className="bg-secondary font-mono text-[10px] font-medium text-secondary-foreground">
        {initials(member.user.name)}
      </AvatarFallback>
    </Avatar>
  )
}

function MutationError({ error }: { error: Error | null }) {
  if (!error) return null
  return (
    <p role="alert" className="text-[13px] text-status-danger">
      {error.message}
    </p>
  )
}

export function TeamSettingsPage() {
  const { isAuthless } = useAppMode()
  const { user } = useAuth()
  const { data: activeOrg, isLoading: orgLoading } = useActiveOrganization()
  const { data: members, isLoading: membersLoading } = useOrganizationMembers()
  const { data: invitations, isLoading: invitationsLoading } = useOrganizationInvitations()

  useEffect(() => {
    trackEvent(AnalyticsEvents.TEAM_VIEWED)
  }, [])

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [removingMember, setRemovingMember] = useState<OrganizationMember | null>(null)
  const [cancelingInvitation, setCancelingInvitation] = useState<Invitation | null>(null)
  const [search, setSearch] = useState('')

  const isLoading = orgLoading || membersLoading || invitationsLoading

  const currentMembership = members?.find((m) => m.userId === user?.id)
  const canManageMembers =
    !isAuthless &&
    (currentMembership?.role === MEMBER_ROLES.OWNER ||
      currentMembership?.role === MEMBER_ROLES.ADMIN)
  const mobileActions = useMemo(
    () =>
      canManageMembers ? (
        <DropdownMenuItem onClick={() => setInviteDialogOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite member
        </DropdownMenuItem>
      ) : undefined,
    [canManageMembers]
  )

  useSettingsTopBar('Team', { mobileActions })

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!members || !query) return members ?? []
    return members.filter(
      (member) =>
        member.user.name.toLowerCase().includes(query) ||
        member.user.email.toLowerCase().includes(query)
    )
  }, [members, search])

  // A local install has no accounts, so there is no team to manage.
  if (isAuthless) return <LocalInstallNotice />

  if (!activeOrg && !orgLoading) {
    return (
      <EmptyState
        icon={Users}
        tone="warning"
        title="No organization selected"
        description="Select an organization to see its members."
        className="max-w-4xl"
      />
    )
  }

  const totalMembers = members?.length ?? 0
  const pendingInvites = invitations?.length ?? 0
  const admins =
    members?.filter((m) => m.role === MEMBER_ROLES.ADMIN || m.role === MEMBER_ROLES.OWNER).length ??
    0
  const columnCount = canManageMembers ? 5 : 4

  return (
    <SettingsPage
      wide
      title="Members"
      count={isLoading ? undefined : totalMembers}
      description={
        isLoading
          ? undefined
          : `${admins} with admin access${activeOrg?.name ? ` in ${activeOrg.name}` : ''}`
      }
      actions={
        canManageMembers ? (
          <Button onClick={() => setInviteDialogOpen(true)} size="xs">
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            Invite member
          </Button>
        ) : undefined
      }
    >
      <Panel>
        {totalMembers > MEMBER_SEARCH_THRESHOLD ? (
          <PanelHeader>
            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter by name or email"
                aria-label="Filter members by name or email"
                className="pl-8"
              />
            </div>
            {search.trim() ? (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {filteredMembers.length} of {totalMembers}
              </span>
            ) : null}
          </PanelHeader>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last sign-in</TableHead>
              {canManageMembers && (
                <TableHead className="w-px">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-7 w-7 rounded-md" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-3.5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-3.5 w-24" />
                  </TableCell>
                  {canManageMembers && <TableCell />}
                </TableRow>
              ))
            ) : filteredMembers.length > 0 ? (
              filteredMembers.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isCurrentUser={member.userId === user?.id}
                  showActions={canManageMembers}
                  canManage={canManageMembers && member.role !== MEMBER_ROLES.OWNER}
                  onRemove={() => {
                    trackEvent(AnalyticsEvents.DIALOG_OPENED, {
                      [AnalyticsProperties.DIALOG_TYPE]: DialogType.REMOVE_MEMBER,
                    })
                    setRemovingMember(member)
                  }}
                />
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="p-0">
                  <EmptyState
                    size="inline"
                    icon={Users}
                    title={search.trim() ? 'No members match' : 'No members found'}
                    description={search.trim() ? `Nothing matches "${search.trim()}".` : undefined}
                    actions={
                      search.trim() ? (
                        <Button variant="outline" size="xs" onClick={() => setSearch('')}>
                          Clear filter
                        </Button>
                      ) : undefined
                    }
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Panel>

      {invitations && invitations.length > 0 ? (
        <>
          <SectionHeader title="Pending invitations" count={pendingInvites} className="pt-2" />
          <Panel>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  {canManageMembers && (
                    <TableHead className="w-px">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <InvitationRow
                    key={invitation.id}
                    invitation={invitation}
                    canManage={canManageMembers}
                    organizationId={activeOrg?.id ?? ''}
                    onCancel={() => {
                      trackEvent(AnalyticsEvents.DIALOG_OPENED, {
                        [AnalyticsProperties.DIALOG_TYPE]: DialogType.CANCEL_INVITATION,
                      })
                      setCancelingInvitation(invitation)
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </Panel>
        </>
      ) : null}

      {/* Invite Dialog */}
      <InviteDialog
        open={inviteDialogOpen}
        onOpenChange={(open) => {
          trackEvent(open ? AnalyticsEvents.DIALOG_OPENED : AnalyticsEvents.DIALOG_CLOSED, {
            [AnalyticsProperties.DIALOG_TYPE]: DialogType.INVITE_MEMBER,
          })
          setInviteDialogOpen(open)
        }}
        organizationId={activeOrg?.id ?? ''}
      />

      {/* Remove Member Dialog */}
      <RemoveMemberDialog
        member={removingMember}
        open={!!removingMember}
        onOpenChange={(open) => {
          if (!open) {
            trackEvent(AnalyticsEvents.DIALOG_CLOSED, {
              [AnalyticsProperties.DIALOG_TYPE]: DialogType.REMOVE_MEMBER,
            })
            setRemovingMember(null)
          }
        }}
      />

      {/* Cancel Invitation Dialog */}
      <CancelInvitationDialog
        invitation={cancelingInvitation}
        open={!!cancelingInvitation}
        onOpenChange={(open) => {
          if (!open) {
            trackEvent(AnalyticsEvents.DIALOG_CLOSED, {
              [AnalyticsProperties.DIALOG_TYPE]: DialogType.CANCEL_INVITATION,
            })
            setCancelingInvitation(null)
          }
        }}
      />
    </SettingsPage>
  )
}

function MemberRow({
  member,
  isCurrentUser,
  showActions,
  canManage,
  onRemove,
}: {
  member: OrganizationMember
  isCurrentUser: boolean
  /** The viewer can manage members, so the table has an actions column. */
  showActions: boolean
  /** This member's role and membership can be changed. */
  canManage: boolean
  onRemove: () => void
}) {
  const roleConfig = getRoleConfig(member.role)
  const updateRoleMutation = useUpdateMemberRole()

  const handleRoleChange = async (newRole: MemberRole) => {
    if (newRole !== member.role) {
      await updateRoleMutation.mutateAsync({
        memberId: member.id,
        role: newRole,
      })
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <MemberAvatar member={member} />
          <div className="min-w-0 max-w-56 sm:max-w-none">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{member.user.name}</p>
              {isCurrentUser && <Badge variant="outline">You</Badge>}
            </div>
            <p className="truncate text-xs text-muted-foreground" title={member.user.email}>
              {member.user.email}
            </p>
          </div>
        </div>
      </TableCell>

      <TableCell>
        {canManage ? (
          <div className="w-28">
            <Select
              value={member.role}
              onChange={(event) => handleRoleChange(event.target.value as MemberRole)}
              disabled={updateRoleMutation.isPending}
              aria-label={`Role for ${member.user.name}`}
              className="h-7"
            >
              {assignableRoles.map((role) => (
                <option key={role.value} value={role.value} title={role.description}>
                  {role.label}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <span title={roleConfig.description}>{roleConfig.label}</span>
        )}
      </TableCell>

      <TableCell className="whitespace-nowrap font-mono tabular-nums text-muted-foreground">
        {formatDate(member.createdAt)}
      </TableCell>

      <TableCell className="whitespace-nowrap font-mono tabular-nums text-muted-foreground">
        {formatDate(member.user.lastSignInAt)}
      </TableCell>

      {showActions && (
        <TableCell className="text-right">
          {canManage && !isCurrentUser ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Actions for ${member.user.name}`}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={onRemove}
                  className="text-status-danger focus:text-status-danger"
                >
                  Remove from team
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </TableCell>
      )}
    </TableRow>
  )
}

function InvitationRow({
  invitation,
  canManage,
  organizationId,
  onCancel,
}: {
  invitation: Invitation
  canManage: boolean
  organizationId: string
  onCancel: () => void
}) {
  const roleConfig = getRoleConfig(invitation.role)
  const resendMutation = useResendInvitation()

  const handleResend = async () => {
    await resendMutation.mutateAsync({
      email: invitation.email,
      role: invitation.role,
      organizationId,
    })
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        <span className="block max-w-56 truncate sm:max-w-none" title={invitation.email}>
          {invitation.email}
        </span>
      </TableCell>
      <TableCell>{roleConfig.label}</TableCell>
      <TableCell className="whitespace-nowrap font-mono tabular-nums text-muted-foreground">
        {formatDate(invitation.expiresAt)}
      </TableCell>
      {canManage && (
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="outline"
              size="xs"
              onClick={handleResend}
              disabled={resendMutation.isPending}
            >
              {resendMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Resend
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Actions for the invitation to ${invitation.email}`}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={onCancel}
                  className="text-status-danger focus:text-status-danger"
                >
                  Cancel invitation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      )}
    </TableRow>
  )
}

function InviteDialog({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>(MEMBER_ROLES.MEMBER)

  const inviteMutation = useInviteMember()
  const isLoading = inviteMutation.isPending

  useEffect(() => {
    if (!open) {
      setEmail('')
      setRole(MEMBER_ROLES.MEMBER)
      inviteMutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only reset when dialog closes
  }, [open, inviteMutation.reset])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await inviteMutation.mutateAsync({
        email,
        role,
        organizationId,
      })
      onOpenChange(false)
    } catch {
      // Error is handled by mutation
    }
  }

  const selectedRole = getRoleConfig(role)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Invite team member</DialogTitle>
          <DialogDescription>They get an email with a link to join.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[13px]">
              Email address
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-role" className="text-[13px]">
              Role
            </Label>
            <Select
              id="invite-role"
              value={role}
              onChange={(event) => setRole(event.target.value as MemberRole)}
            >
              {assignableRoles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{selectedRole.description}.</p>
          </div>

          <MutationError error={inviteMutation.error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !email}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isLoading ? 'Sending…' : 'Send invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RemoveMemberDialog({
  member,
  open,
  onOpenChange,
}: {
  member: OrganizationMember | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const removeMutation = useRemoveMember()
  const isRemoving = removeMutation.isPending

  const handleRemove = async () => {
    if (!member) return

    try {
      await removeMutation.mutateAsync({ memberIdOrEmail: member.id })
      onOpenChange(false)
    } catch {
      // Error handled by mutation
    }
  }

  if (!member) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Remove team member</DialogTitle>
          <DialogDescription>
            They lose access to this organization immediately. You can invite them again later.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <MemberAvatar member={member} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{member.user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
          </div>
        </div>

        <MutationError error={removeMutation.error} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRemoving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleRemove} disabled={isRemoving}>
            {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {isRemoving ? 'Removing…' : 'Remove member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CancelInvitationDialog({
  invitation,
  open,
  onOpenChange,
}: {
  invitation: Invitation | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const cancelMutation = useCancelInvitation()
  const isCanceling = cancelMutation.isPending

  const handleCancel = async () => {
    if (!invitation) return

    try {
      await cancelMutation.mutateAsync(invitation.id)
      onOpenChange(false)
    } catch {
      // Error handled by mutation
    }
  }

  if (!invitation) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Cancel invitation</DialogTitle>
          <DialogDescription>The link in the invitation email stops working.</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 px-3 py-2">
          <p className="truncate text-[13px] font-medium">{invitation.email}</p>
          <p className="text-xs text-muted-foreground">
            Invited as {getRoleConfig(invitation.role).label}
          </p>
        </div>

        <MutationError error={cancelMutation.error} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCanceling}>
            Keep invitation
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={isCanceling}>
            {isCanceling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {isCanceling ? 'Canceling…' : 'Cancel invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
