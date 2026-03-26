import {
  AnalyticsEvents,
  identifyOrganization,
  trackEvent,
  trackOrganizationCreated,
} from '@durabull/analytics'
import { organization } from '@durabull/auth/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, handleRes, type InferResponseType } from '@/lib/api'
import { useAppMode } from './use-app-mode'
import { useAuth } from './use-auth'

/**
 * Better Auth error type
 */
interface BetterAuthError {
  message?: string
  status?: number
  code?: string
}

/**
 * Handle better-auth result errors, showing toast for rate limits.
 * Returns the error message to throw.
 */
function handleAuthError(error: BetterAuthError | undefined, fallback: string): string {
  if (!error) return fallback

  // Show toast for rate limit errors
  if (error.status === 429 || error.code === 'TOO_MANY_REQUESTS') {
    toast.error('Too many requests', {
      description: error.message || 'Please slow down and try again in a moment.',
    })
  }

  return error.message || fallback
}

/**
 * Invitation details returned from the public API
 */
export interface InvitationDetails {
  invitation: {
    id: string
    email: string
    role: string
    status: string
    expiresAt: string
  }
  organization: {
    id: string
    name: string
    slug: string
    logo: string | null
  }
  inviter: {
    name: string
    email: string
    image: string | null
  }
}

/**
 * Error response from the invitations API
 */
interface InvitationError {
  error: string
  code: string
  status?: string
}

/**
 * Organization type from Better Auth
 */
export interface Organization {
  id: string
  name: string
  slug: string
  logo?: string | null
  metadata?: string | null
  createdAt?: Date
}

/**
 * Member role type
 */
export type MemberRole = 'owner' | 'admin' | 'member'

/**
 * Invitation status type
 */
export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'canceled'

/**
 * Invitation type
 */
export interface Invitation {
  id: string
  organizationId: string
  email: string
  role: MemberRole
  status: InvitationStatus
  expiresAt: Date
  inviterId: string
}

/**
 * Member type (organization member)
 */
export interface OrganizationMember {
  id: string
  userId: string
  organizationId: string
  role: MemberRole
  createdAt: Date
  user: {
    id: string
    name: string
    email: string
    image?: string | null
    lastSignInAt?: string | Date | null
  }
}

// Query keys for organization data
export const organizationKeys = {
  all: ['organizations'] as const,
  active: ['organization', 'active'] as const,
  invitations: ['invitations'] as const,
  members: ['members'] as const,
  orgInvitations: ['org-invitations'] as const,
  list: () => [...organizationKeys.all, 'list'] as const,
  invitationById: (id: string) => ['invitation', id] as const,
}

type SessionResponse = InferResponseType<(typeof api.session)['$get'], 200>
type TeamMembersResponse = InferResponseType<(typeof api.team.members)['$get'], 200>

function toOrganizationFromSession(
  organizationFromSession: SessionResponse['organization']
): Organization | null {
  if (!organizationFromSession) return null
  return {
    id: organizationFromSession.id,
    name: organizationFromSession.name,
    slug: organizationFromSession.slug,
  }
}

async function fetchSessionOrganization(): Promise<Organization | null> {
  const response = await api.session.$get()
  const data = await handleRes<SessionResponse>(response)
  return toOrganizationFromSession(data.organization)
}

/**
 * Hook to fetch invitation details by ID (public - no auth required).
 * Used on the dedicated invite acceptance page to show invitation info.
 */
export function useInvitationById(invitationId: string) {
  return useQuery({
    queryKey: organizationKeys.invitationById(invitationId),
    queryFn: async (): Promise<InvitationDetails> => {
      const response = await fetch(`/api/invitations/${invitationId}`)
      const data = await response.json()

      if (!response.ok) {
        const error = data as InvitationError
        throw new Error(error.error || 'Failed to fetch invitation')
      }

      return data as InvitationDetails
    },
    enabled: !!invitationId,
    retry: false, // Don't retry on error - invitation might not exist
    staleTime: 60000, // Cache for 1 minute
  })
}

/**
 * Hook to get the user's organizations
 */
export function useOrganizations() {
  const { isAuthenticated } = useAuth()
  const { isAuthless, isLoading: modeLoading } = useAppMode()

  return useQuery({
    queryKey: organizationKeys.list(),
    queryFn: async () => {
      if (modeLoading) {
        return []
      }
      if (isAuthless) {
        const authlessOrganization = await fetchSessionOrganization()
        return authlessOrganization ? [authlessOrganization] : []
      }
      const result = await organization.list()
      if (result.error) {
        throw new Error(handleAuthError(result.error, 'Failed to fetch organizations'))
      }
      return result.data ?? []
    },
    enabled: !modeLoading && (isAuthless || isAuthenticated),
    retry: 1, // Only retry once to prevent infinite loops
    staleTime: 30000, // Cache for 30 seconds
  })
}

/**
 * Hook to get the active organization from the session
 */
export function useActiveOrganization() {
  const { isAuthenticated, session } = useAuth()
  const { isAuthless, isLoading: modeLoading } = useAppMode()

  return useQuery({
    queryKey: organizationKeys.active,
    queryFn: async () => {
      if (modeLoading) {
        return null
      }
      if (isAuthless) {
        return fetchSessionOrganization()
      }
      const result = await organization.getFullOrganization()
      if (result.error) {
        // No active organization is not an error - just return null
        return null
      }
      return result.data ?? null
    },
    enabled:
      !modeLoading &&
      (isAuthless ||
        (isAuthenticated &&
          !!(session as { activeOrganizationId?: string })?.activeOrganizationId)),
  })
}

/**
 * Hook to create a new organization
 */
export function useCreateOrganization() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { isAuthless } = useAppMode()

  return useMutation({
    mutationFn: async (data: { name: string; slug: string; logo?: string }) => {
      if (isAuthless) {
        throw new Error('Organization management is disabled in authless mode.')
      }
      const result = await organization.create(data)
      if (result.error) {
        throw new Error(handleAuthError(result.error, 'Failed to create organization'))
      }
      return result.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.all })
      queryClient.invalidateQueries({ queryKey: organizationKeys.active })

      // Track organization creation in PostHog
      if (data && user) {
        trackOrganizationCreated(
          {
            id: data.id,
            name: data.name,
            slug: data.slug,
            logo: data.logo,
            createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
          },
          user.id
        )
      }
    },
  })
}

/**
 * Hook to set the active organization
 */
export function useSetActiveOrganization() {
  const queryClient = useQueryClient()
  const { isAuthless } = useAppMode()

  return useMutation({
    mutationFn: async (organizationId: string) => {
      if (isAuthless) {
        const authlessOrganization = await fetchSessionOrganization()
        if (!authlessOrganization) {
          throw new Error('No active organization found.')
        }
        return authlessOrganization
      }
      const result = await organization.setActive({ organizationId })
      if (result.error) {
        throw new Error(handleAuthError(result.error, 'Failed to set active organization'))
      }
      return result.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.active })
      // Also invalidate connections since they're scoped to organization
      queryClient.invalidateQueries({ queryKey: ['connections'] })

      // Track organization switch and identify in PostHog
      if (data) {
        trackEvent(AnalyticsEvents.ORGANIZATION_SWITCHED, {
          organization_id: data.id,
          organization_name: data.name,
          organization_slug: data.slug,
        })
        identifyOrganization({
          id: data.id,
          name: data.name,
          slug: data.slug,
          logo: data.logo,
          createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        })
      }
    },
  })
}

/**
 * Hook to get pending invitations for the current user
 * Uses listUserInvitations which doesn't require an active organization
 */
export function usePendingInvitations() {
  const { isAuthenticated } = useAuth()
  const { isAuthless, isLoading: modeLoading } = useAppMode()

  return useQuery({
    queryKey: organizationKeys.invitations,
    queryFn: async () => {
      if (modeLoading) return []
      if (isAuthless) return []
      // Use listUserInvitations to get invitations sent TO this user
      // This doesn't require an active organization
      const result = await organization.listUserInvitations()
      if (result.error) {
        // Return empty array on error instead of throwing
        console.warn('Failed to fetch invitations:', result.error)
        return []
      }
      // Filter to only pending invitations
      const invitations = result.data ?? []
      return invitations.filter((inv: Invitation) => inv.status === 'pending')
    },
    enabled: !modeLoading && (isAuthless || isAuthenticated),
    retry: 1,
    staleTime: 30000,
  })
}

/**
 * Hook to accept an organization invitation
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient()
  const { isAuthless } = useAppMode()

  return useMutation({
    mutationFn: async (invitationId: string) => {
      if (isAuthless) {
        throw new Error('Invitations are disabled in authless mode.')
      }
      const result = await organization.acceptInvitation({ invitationId })
      if (result.error) {
        throw new Error(handleAuthError(result.error, 'Failed to accept invitation'))
      }
      return { ...result.data, invitationId }
    },
    onSuccess: (data) => {
      trackEvent(AnalyticsEvents.INVITATION_ACCEPTED, {
        invitation_id: data?.invitationId,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: organizationKeys.all })
      queryClient.invalidateQueries({ queryKey: organizationKeys.invitations })
      queryClient.invalidateQueries({ queryKey: organizationKeys.active })
      // Note: Organization identification happens when the active organization is set
      // after the user navigates to the org, via useSetActiveOrganization
    },
    onError: (_, invitationId) => {
      trackEvent(AnalyticsEvents.INVITATION_ACCEPTED, {
        invitation_id: invitationId,
        success: false,
      })
    },
  })
}

/**
 * Hook to reject an organization invitation
 */
export function useRejectInvitation() {
  const queryClient = useQueryClient()
  const { isAuthless } = useAppMode()

  return useMutation({
    mutationFn: async (invitationId: string) => {
      if (isAuthless) {
        throw new Error('Invitations are disabled in authless mode.')
      }
      const result = await organization.rejectInvitation({ invitationId })
      if (result.error) {
        throw new Error(handleAuthError(result.error, 'Failed to reject invitation'))
      }
      return { ...result.data, invitationId }
    },
    onSuccess: (data) => {
      trackEvent(AnalyticsEvents.INVITATION_REJECTED, {
        invitation_id: data?.invitationId,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: organizationKeys.invitations })
    },
    onError: (_, invitationId) => {
      trackEvent(AnalyticsEvents.INVITATION_REJECTED, {
        invitation_id: invitationId,
        success: false,
      })
    },
  })
}

/**
 * Hook to check if an organization slug is available
 */
export function useCheckSlug() {
  const { isAuthless } = useAppMode()

  return useMutation({
    mutationFn: async (slug: string) => {
      if (isAuthless) {
        throw new Error('Organization management is disabled in authless mode.')
      }
      const result = await organization.checkSlug({ slug })
      if (result.error) {
        throw new Error(handleAuthError(result.error, 'Failed to check slug'))
      }
      return result.data
    },
  })
}

/**
 * Hook to invite a user to the organization
 */
export function useInviteMember() {
  const queryClient = useQueryClient()
  const { isAuthless } = useAppMode()

  return useMutation({
    mutationFn: async (data: { email: string; role: MemberRole; organizationId: string }) => {
      if (isAuthless) {
        throw new Error('Team management is disabled in authless mode.')
      }
      const result = await organization.inviteMember(data)
      if (result.error) {
        throw new Error(handleAuthError(result.error, 'Failed to invite member'))
      }
      return { ...result.data, ...data }
    },
    onSuccess: (data) => {
      trackEvent(AnalyticsEvents.MEMBER_INVITED, {
        invitee_email: data?.email,
        member_role: data?.role,
        organization_id: data?.organizationId,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: organizationKeys.all })
      queryClient.invalidateQueries({ queryKey: organizationKeys.members })
      queryClient.invalidateQueries({ queryKey: organizationKeys.orgInvitations })
    },
    onError: (_, variables) => {
      trackEvent(AnalyticsEvents.MEMBER_INVITED, {
        invitee_email: variables.email,
        member_role: variables.role,
        organization_id: variables.organizationId,
        success: false,
      })
    },
  })
}

/**
 * Hook to get the members of the active organization
 */
export function useOrganizationMembers() {
  const { isAuthenticated, session, user } = useAuth()
  const { isAuthless, isLoading: modeLoading } = useAppMode()
  const activeOrgId = (session as { activeOrganizationId?: string })?.activeOrganizationId

  return useQuery({
    queryKey: [...organizationKeys.members, user?.id, activeOrgId],
    queryFn: async () => {
      if (modeLoading) return []
      if (isAuthless) return []
      const response = await api.team.members.$get()
      const data = await handleRes<TeamMembersResponse>(response)
      return data.members.map((member) => ({
        ...member,
        role: member.role as MemberRole,
        createdAt: new Date(member.createdAt),
        user: {
          ...member.user,
          lastSignInAt: member.user.lastSignInAt ? new Date(member.user.lastSignInAt) : null,
        },
      }))
    },
    enabled: !modeLoading && (isAuthless || (isAuthenticated && !!activeOrgId)),
    retry: 1,
    staleTime: 30000,
    refetchOnMount: 'always',
  })
}

/**
 * Hook to get the pending invitations for the active organization
 */
export function useOrganizationInvitations() {
  const { isAuthenticated, session } = useAuth()
  const { isAuthless, isLoading: modeLoading } = useAppMode()
  const activeOrgId = (session as { activeOrganizationId?: string })?.activeOrganizationId

  return useQuery({
    queryKey: [...organizationKeys.orgInvitations, activeOrgId],
    queryFn: async () => {
      if (modeLoading) return []
      if (isAuthless) return []
      const result = await organization.listInvitations()
      if (result.error) {
        throw new Error(handleAuthError(result.error, 'Failed to fetch invitations'))
      }
      // Filter to only pending invitations
      const invitations = result.data ?? []
      return invitations.filter((inv: Invitation) => inv.status === 'pending') as Invitation[]
    },
    enabled: !modeLoading && (isAuthless || (isAuthenticated && !!activeOrgId)),
    retry: 1,
    staleTime: 30000,
  })
}

/**
 * Hook to remove a member from the organization
 */
export function useRemoveMember() {
  const queryClient = useQueryClient()
  const { isAuthless } = useAppMode()

  return useMutation({
    mutationFn: async (data: { memberIdOrEmail: string; organizationId?: string }) => {
      if (isAuthless) {
        throw new Error('Team management is disabled in authless mode.')
      }
      const result = await organization.removeMember(data)
      if (result.error) {
        throw new Error(handleAuthError(result.error, 'Failed to remove member'))
      }
      return { ...result.data, ...data }
    },
    onSuccess: (data) => {
      trackEvent(AnalyticsEvents.MEMBER_REMOVED, {
        member_id: data?.memberIdOrEmail,
        organization_id: data?.organizationId,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: organizationKeys.members })
      queryClient.invalidateQueries({ queryKey: organizationKeys.all })
    },
    onError: (_, variables) => {
      trackEvent(AnalyticsEvents.MEMBER_REMOVED, {
        member_id: variables.memberIdOrEmail,
        organization_id: variables.organizationId,
        success: false,
      })
    },
  })
}

/**
 * Hook to cancel a pending invitation
 */
export function useCancelInvitation() {
  const queryClient = useQueryClient()
  const { isAuthless } = useAppMode()

  return useMutation({
    mutationFn: async (invitationId: string) => {
      if (isAuthless) {
        throw new Error('Invitations are disabled in authless mode.')
      }
      const result = await organization.cancelInvitation({ invitationId })
      if (result.error) {
        throw new Error(handleAuthError(result.error, 'Failed to cancel invitation'))
      }
      return { ...result.data, invitationId }
    },
    onSuccess: (data) => {
      trackEvent(AnalyticsEvents.INVITATION_CANCELLED, {
        invitation_id: data?.invitationId,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: organizationKeys.orgInvitations })
    },
    onError: (_, invitationId) => {
      trackEvent(AnalyticsEvents.INVITATION_CANCELLED, {
        invitation_id: invitationId,
        success: false,
      })
    },
  })
}

/**
 * Hook to resend a pending invitation
 */
export function useResendInvitation() {
  const queryClient = useQueryClient()
  const { isAuthless } = useAppMode()

  return useMutation({
    mutationFn: async (data: { email: string; role: MemberRole; organizationId: string }) => {
      if (isAuthless) {
        throw new Error('Invitations are disabled in authless mode.')
      }
      const result = await organization.inviteMember({
        ...data,
        resend: true,
      })
      if (result.error) {
        throw new Error(handleAuthError(result.error, 'Failed to resend invitation'))
      }
      return { ...result.data, ...data }
    },
    onSuccess: (data) => {
      trackEvent(AnalyticsEvents.INVITATION_RESENT, {
        invitee_email: data?.email,
        member_role: data?.role,
        organization_id: data?.organizationId,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: organizationKeys.orgInvitations })
    },
    onError: (_, variables) => {
      trackEvent(AnalyticsEvents.INVITATION_RESENT, {
        invitee_email: variables.email,
        organization_id: variables.organizationId,
        success: false,
      })
    },
  })
}

/**
 * Hook to update a member's role
 */
export function useUpdateMemberRole() {
  const queryClient = useQueryClient()
  const { isAuthless } = useAppMode()

  return useMutation({
    mutationFn: async (data: {
      memberId: string
      role: MemberRole
      organizationId?: string
      oldRole?: string
    }) => {
      if (isAuthless) {
        throw new Error('Team management is disabled in authless mode.')
      }
      const result = await organization.updateMemberRole({
        memberId: data.memberId,
        role: data.role,
        organizationId: data.organizationId,
      })
      if (result.error) {
        throw new Error(handleAuthError(result.error, 'Failed to update member role'))
      }
      return { ...result.data, ...data }
    },
    onSuccess: (data) => {
      trackEvent(AnalyticsEvents.MEMBER_ROLE_UPDATED, {
        member_id: data?.memberId,
        old_role: data?.oldRole,
        new_role: data?.role,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: organizationKeys.members })
    },
    onError: (_, variables) => {
      trackEvent(AnalyticsEvents.MEMBER_ROLE_UPDATED, {
        member_id: variables.memberId,
        old_role: variables.oldRole,
        new_role: variables.role,
        success: false,
      })
    },
  })
}
