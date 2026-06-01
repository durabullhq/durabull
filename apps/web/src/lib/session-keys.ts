export const SESSION_KEYS = {
  ACTIVE_ORGANIZATION_ID: 'activeOrganizationId',
} as const

export type SessionWithActiveOrganization = {
  [SESSION_KEYS.ACTIVE_ORGANIZATION_ID]?: string
}
