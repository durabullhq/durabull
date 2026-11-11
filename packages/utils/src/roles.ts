/**
 * Organization member roles as Better Auth stores them. A member can hold
 * several roles, stored as one comma-separated string ("owner,admin"), so
 * permission checks must look for a role inside the list, never compare the
 * whole string.
 */
export type MemberRoleName = 'owner' | 'admin' | 'member'

/** Whether a stored member role includes `wanted`. */
export function hasMemberRole(role: string | null | undefined, wanted: MemberRoleName): boolean {
  if (!role) return false
  return role.split(',').some((part) => part.trim() === wanted)
}

/** The member owns the organization (billing, deletion, ownership transfer). */
export function isOwnerRole(role: string | null | undefined): boolean {
  return hasMemberRole(role, 'owner')
}

/** The member may manage the organization's resources: owners and admins. */
export function isOwnerOrAdminRole(role: string | null | undefined): boolean {
  return hasMemberRole(role, 'owner') || hasMemberRole(role, 'admin')
}
