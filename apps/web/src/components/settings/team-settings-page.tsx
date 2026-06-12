import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clock,
  Crown,
  Loader2,
  Mail,
  MoreHorizontal,
  Send,
  Shield,
  Trash2,
  User,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { cn } from '@/lib/utils'

const roles: {
  value: MemberRole
  label: string
  icon: typeof User
  color: string
  bgColor: string
  description: string
}[] = [
  {
    value: MEMBER_ROLES.OWNER,
    label: 'Owner',
    icon: Crown,
    color: 'text-status-warning',
    bgColor: 'bg-status-warning/10',
    description: 'Full access including billing and danger zone',
  },
  {
    value: MEMBER_ROLES.ADMIN,
    label: 'Admin',
    icon: Shield,
    color: 'text-status-priority',
    bgColor: 'bg-status-priority/10',
    description: 'Can manage members and settings',
  },
  {
    value: MEMBER_ROLES.MEMBER,
    label: 'Member',
    icon: User,
    color: 'text-status-active',
    bgColor: 'bg-status-active/10',
    description: 'Can view and use resources',
  },
]

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

export function TeamSettingsPage() {
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

  const isLoading = orgLoading || membersLoading || invitationsLoading

  const currentMembership = members?.find((m) => m.userId === user?.id)
  const canManageMembers =
    currentMembership?.role === MEMBER_ROLES.OWNER || currentMembership?.role === MEMBER_ROLES.ADMIN
  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Users className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Team</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">
            {`Manage members of ${activeOrg?.name ?? 'your organization'}`}
          </span>
        </div>
      ),
      actions: canManageMembers ? (
        <Button onClick={() => setInviteDialogOpen(true)} size="xs" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite Member
        </Button>
      ) : undefined,
      mobileActions: canManageMembers ? (
        <DropdownMenuItem onClick={() => setInviteDialogOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite Member
        </DropdownMenuItem>
      ) : undefined,
    }),
    [activeOrg?.name, canManageMembers]
  )

  useAppTopBar(topBarConfig)

  if (!activeOrg && !orgLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-status-warning/10 p-4 mb-4">
          <AlertCircle className="h-8 w-8 text-status-warning" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No Organization Selected</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Please select an organization to view team members.
        </p>
      </div>
    )
  }

  const totalMembers = members?.length ?? 0
  const pendingInvites = invitations?.length ?? 0
  const admins =
    members?.filter((m) => m.role === MEMBER_ROLES.ADMIN || m.role === MEMBER_ROLES.OWNER).length ??
    0

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Members"
          value={totalMembers}
          icon={Users}
          loading={isLoading}
          variant="violet"
        />
        <StatCard
          title="Admins"
          value={admins}
          icon={Shield}
          loading={isLoading}
          variant="purple"
        />
        <StatCard
          title="Pending Invitations"
          value={pendingInvites}
          icon={Mail}
          loading={isLoading}
          variant="amber"
        />
      </div>

      {/* Members Table */}
      <Card>
        <CardHeader className="border-b bg-muted/30 py-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Organization Members
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last sign in</TableHead>
              {canManageMembers && <TableHead className="w-[60px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-md" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  {canManageMembers && (
                    <TableCell>
                      <Skeleton className="h-8 w-8" />
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : members && members.length > 0 ? (
              members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isCurrentUser={member.userId === user?.id}
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
              <TableRow>
                <TableCell colSpan={canManageMembers ? 6 : 5} className="h-24 text-center">
                  <p className="text-muted-foreground">No members found</p>
                </TableCell>
              </TableRow>
            )}

            {/* Pending Invitations Section */}
            {invitations && invitations.length > 0 && (
              <>
                <TableRow className="hover:bg-transparent bg-muted/30">
                  <TableCell colSpan={canManageMembers ? 6 : 5} className="py-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      Pending Invitations ({invitations.length})
                    </div>
                  </TableCell>
                </TableRow>
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
              </>
            )}
          </TableBody>
        </Table>
      </Card>

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
    </div>
  )
}

function MemberRow({
  member,
  isCurrentUser,
  canManage,
  onRemove,
}: {
  member: OrganizationMember
  isCurrentUser: boolean
  canManage: boolean
  onRemove: () => void
}) {
  const roleConfig = getRoleConfig(member.role)
  const RoleIcon = roleConfig.icon
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
    <TableRow className="group">
      {/* Member Info */}
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 rounded-md border">
            <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
            <AvatarFallback className="rounded-md border bg-secondary font-mono text-xs font-medium text-secondary-foreground">
              {member.user.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">{member.user.name}</p>
              {isCurrentUser && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  You
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{member.user.email}</p>
          </div>
        </div>
      </TableCell>

      {/* Role */}
      <TableCell>
        {canManage && member.role !== MEMBER_ROLES.OWNER ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-7 gap-1.5 px-2', roleConfig.bgColor)}
                disabled={updateRoleMutation.isPending}
              >
                <RoleIcon className={cn('h-3.5 w-3.5', roleConfig.color)} />
                <span className={roleConfig.color}>{roleConfig.label}</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {roles
                .filter((r) => r.value !== MEMBER_ROLES.OWNER)
                .map((role) => (
                  <DropdownMenuItem
                    key={role.value}
                    onClick={() => handleRoleChange(role.value)}
                    className="cursor-pointer"
                  >
                    <role.icon className={cn('mr-2 h-4 w-4', role.color)} />
                    <div>
                      <p>{role.label}</p>
                      <p className="text-xs text-muted-foreground">{role.description}</p>
                    </div>
                    {member.role === role.value && (
                      <Check className="ml-auto h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Badge variant="outline" className={cn('gap-1.5', roleConfig.bgColor, roleConfig.color)}>
            <RoleIcon className="h-3 w-3" />
            {roleConfig.label}
          </Badge>
        )}
      </TableCell>

      {/* Status */}
      <TableCell>
        <Badge variant="outline" className="bg-status-success/10 text-status-success">
          <Check className="mr-1 h-3 w-3" />
          Active
        </Badge>
      </TableCell>

      {/* Joined Date */}
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(member.createdAt)}
      </TableCell>

      {/* Last Sign In */}
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(member.user.lastSignInAt)}
      </TableCell>

      {/* Actions */}
      {canManage && (
        <TableCell>
          {!isCurrentUser && member.role !== MEMBER_ROLES.OWNER && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Member actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={onRemove}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <UserMinus className="mr-2 h-4 w-4" />
                  Remove from team
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
  const RoleIcon = roleConfig.icon
  const resendMutation = useResendInvitation()

  const handleResend = async () => {
    await resendMutation.mutateAsync({
      email: invitation.email,
      role: invitation.role,
      organizationId,
    })
  }

  return (
    <TableRow className="group bg-muted/10">
      {/* Invitation Info */}
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 rounded-md border border-dashed">
            <AvatarFallback className="rounded-md bg-muted text-muted-foreground">
              <Mail className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-muted-foreground">{invitation.email}</p>
            <p className="text-xs text-muted-foreground">
              Expires{' '}
              {new Date(invitation.expiresAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>
      </TableCell>

      {/* Role */}
      <TableCell>
        <Badge variant="outline" className={cn('gap-1.5', roleConfig.bgColor, roleConfig.color)}>
          <RoleIcon className="h-3 w-3" />
          {roleConfig.label}
        </Badge>
      </TableCell>

      {/* Status */}
      <TableCell>
        <Badge variant="outline" className="bg-status-warning/10 text-status-warning">
          <Clock className="mr-1 h-3 w-3" />
          Pending
        </Badge>
      </TableCell>

      {/* Joined Date */}
      <TableCell className="text-sm text-muted-foreground">—</TableCell>

      {/* Last Sign In */}
      <TableCell className="text-sm text-muted-foreground">—</TableCell>

      {/* Actions */}
      {canManage && (
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                disabled={resendMutation.isPending}
              >
                {resendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
                <span className="sr-only">Invitation actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleResend} className="cursor-pointer">
                <Send className="mr-2 h-4 w-4" />
                Resend invite email
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onCancel}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <X className="mr-2 h-4 w-4" />
                Cancel invitation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Invite Team Member
          </DialogTitle>
          <DialogDescription>
            Send an invitation email to add a new member to your organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              required
            />
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label>Role</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <div className="flex items-center gap-2">
                    <selectedRole.icon className={cn('h-4 w-4', selectedRole.color)} />
                    <span>{selectedRole.label}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                {roles
                  .filter((r) => r.value !== MEMBER_ROLES.OWNER)
                  .map((r) => (
                    <DropdownMenuItem
                      key={r.value}
                      onClick={() => setRole(r.value)}
                      className="cursor-pointer"
                    >
                      <r.icon className={cn('mr-2 h-4 w-4', r.color)} />
                      <div className="flex-1">
                        <p>{r.label}</p>
                        <p className="text-xs text-muted-foreground">{r.description}</p>
                      </div>
                      {role === r.value && <Check className="ml-2 h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Error display */}
          {inviteMutation.error && (
            <div className="flex items-center gap-2 text-sm p-3 rounded-md bg-destructive/10 text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{inviteMutation.error.message}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !email}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send Invitation
                </>
              )}
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
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <UserMinus className="h-5 w-5" />
            Remove Team Member
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to remove this member from the organization?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5">
            <Avatar className="h-8 w-8 rounded-md border">
              <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
              <AvatarFallback className="rounded-md border bg-secondary font-mono text-xs font-medium text-secondary-foreground">
                {member.user.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{member.user.name}</p>
              <p className="text-sm text-muted-foreground">{member.user.email}</p>
            </div>
          </div>
        </div>

        {removeMutation.error && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-md bg-destructive/10 text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{removeMutation.error.message}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRemoving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleRemove} disabled={isRemoving}>
            {isRemoving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Removing...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Remove Member
              </>
            )}
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
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <X className="h-5 w-5" />
            Cancel Invitation
          </DialogTitle>
          <DialogDescription>Are you sure you want to cancel this invitation?</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5">
            <Avatar className="h-8 w-8 rounded-md border border-dashed">
              <AvatarFallback className="rounded-md bg-muted text-muted-foreground">
                <Mail className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{invitation.email}</p>
              <p className="text-sm text-muted-foreground">
                Invited as {getRoleConfig(invitation.role).label}
              </p>
            </div>
          </div>
        </div>

        {cancelMutation.error && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-md bg-destructive/10 text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{cancelMutation.error.message}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCanceling}>
            Keep Invitation
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={isCanceling}>
            {isCanceling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Canceling...
              </>
            ) : (
              <>
                <X className="mr-2 h-4 w-4" />
                Cancel Invitation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type StatVariant = 'default' | 'violet' | 'purple' | 'amber'

interface StatCardProps {
  title: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  loading?: boolean
  variant?: StatVariant
}

const variantStyles: Record<
  StatVariant,
  {
    icon: string
    accent: string
  }
> = {
  default: {
    icon: 'text-muted-foreground',
    accent: 'bg-status-neutral/40',
  },
  violet: {
    icon: 'text-status-priority',
    accent: 'bg-status-priority',
  },
  purple: {
    icon: 'text-status-priority',
    accent: 'bg-status-priority',
  },
  amber: {
    icon: 'text-status-warning',
    accent: 'bg-status-warning',
  },
}

function StatCard({ title, value, icon: Icon, loading, variant = 'default' }: StatCardProps) {
  const styles = variantStyles[variant]

  return (
    <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
      <span className={cn('absolute inset-x-0 top-0 h-0.5', styles.accent)} aria-hidden="true" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="eyebrow">{title}</CardTitle>
        <Icon className={cn('h-4 w-4', styles.icon)} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        )}
      </CardContent>
    </Card>
  )
}
