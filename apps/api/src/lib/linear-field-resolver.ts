import type { LinearIntegration } from '@durabull/dal'
import { fetchLinearMetadata, LinearApiError, type LinearMetadata } from './linear-client'

/**
 * Linear issue fields can be configured by humans using friendly values (a team
 * key like "INTAKE", a project name, an assignee email) but Linear's GraphQL API
 * only accepts opaque UUIDs. This module resolves whatever the user entered into
 * the UUIDs Linear expects, so alert routing "just works" regardless of whether
 * the configured value is an id, key, name, or email.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const METADATA_CACHE_TTL_MS = 60_000

interface CachedMetadata {
  metadata: LinearMetadata
  expiresAt: number
}

const metadataCache = new Map<string, CachedMetadata>()

export interface RawLinearIssueFields {
  teamId: string
  projectId?: string | null
  labelIds?: string[] | null
  assigneeId?: string | null
  stateId?: string | null
  priority?: number | null
}

export interface ResolvedLinearIssueFields {
  teamId: string
  projectId?: string
  labelIds?: string[]
  assigneeId?: string
  stateId?: string
  priority?: number
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim())
}

function normalizeOptional(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeLabels(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return []
  return values.map((value) => value.trim()).filter((value) => value.length > 0)
}

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * A non-UUID value (e.g. a team key or project name) always needs metadata to
 * resolve. When every configured value is already a UUID we can skip the extra
 * Linear API call entirely and preserve the previous behavior exactly.
 */
export function fieldsNeedResolution(raw: RawLinearIssueFields): boolean {
  const candidates = [
    raw.teamId,
    normalizeOptional(raw.projectId),
    normalizeOptional(raw.assigneeId),
    normalizeOptional(raw.stateId),
    ...normalizeLabels(raw.labelIds),
  ]

  return candidates.some((value) => typeof value === 'string' && value.length > 0 && !isUuid(value))
}

function resolveTeamId(metadata: LinearMetadata, value: string): string {
  const trimmed = value.trim()
  const match = metadata.teams.find(
    (team) =>
      team.id === trimmed ||
      equalsIgnoreCase(team.key, trimmed) ||
      equalsIgnoreCase(team.name, trimmed)
  )
  if (match) return match.id

  const available = metadata.teams
    .slice(0, 25)
    .map((team) => `${team.name} (${team.key})`)
    .join(', ')
  throw new LinearApiError(
    `Linear team "${trimmed}" could not be found. Enter the team's name, key, or ID.${
      available ? ` Available teams: ${available}.` : ''
    }`,
    { status: 400, retryable: false }
  )
}

function resolveProjectId(metadata: LinearMetadata, value: string): string | undefined {
  if (isUuid(value)) return value.trim()
  const match = metadata.projects.find((project) => equalsIgnoreCase(project.name, value))
  return match?.id
}

function resolveAssigneeId(metadata: LinearMetadata, value: string): string | undefined {
  if (isUuid(value)) return value.trim()
  const match = metadata.users.find(
    (user) =>
      equalsIgnoreCase(user.name, value) ||
      (typeof user.email === 'string' && equalsIgnoreCase(user.email, value))
  )
  return match?.id
}

function resolveStateId(
  metadata: LinearMetadata,
  value: string,
  teamId: string
): string | undefined {
  if (isUuid(value)) return value.trim()
  const teamScoped = metadata.states.find(
    (state) => state.teamId === teamId && equalsIgnoreCase(state.name, value)
  )
  if (teamScoped) return teamScoped.id
  const anyTeam = metadata.states.find((state) => equalsIgnoreCase(state.name, value))
  return anyTeam?.id
}

function resolveLabelIds(metadata: LinearMetadata, values: string[]): string[] {
  const resolved: string[] = []
  for (const value of values) {
    if (isUuid(value)) {
      resolved.push(value.trim())
      continue
    }
    const match = metadata.labels.find((label) => equalsIgnoreCase(label.name, value))
    if (match) resolved.push(match.id)
  }
  return resolved
}

/**
 * Pure resolver (no network) so it is easy to unit test. The team is required
 * and throws a clear, non-retryable error when it cannot be resolved. Optional
 * fields that cannot be resolved are dropped so the issue is still created.
 */
export function resolveLinearIssueFieldsWithMetadata(
  metadata: LinearMetadata,
  raw: RawLinearIssueFields
): ResolvedLinearIssueFields {
  const teamId = isUuid(raw.teamId) ? raw.teamId.trim() : resolveTeamId(metadata, raw.teamId)

  const projectValue = normalizeOptional(raw.projectId)
  const assigneeValue = normalizeOptional(raw.assigneeId)
  const stateValue = normalizeOptional(raw.stateId)
  const labelValues = normalizeLabels(raw.labelIds)

  const labelIds = resolveLabelIds(metadata, labelValues)

  return {
    teamId,
    projectId: projectValue ? resolveProjectId(metadata, projectValue) : undefined,
    assigneeId: assigneeValue ? resolveAssigneeId(metadata, assigneeValue) : undefined,
    stateId: stateValue ? resolveStateId(metadata, stateValue, teamId) : undefined,
    labelIds: labelIds.length > 0 ? labelIds : undefined,
    priority: typeof raw.priority === 'number' ? raw.priority : undefined,
  }
}

async function getCachedLinearMetadata(
  organizationId: string,
  accessToken: string
): Promise<LinearMetadata> {
  const cached = metadataCache.get(organizationId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.metadata
  }

  const metadata = await fetchLinearMetadata(accessToken)
  metadataCache.set(organizationId, {
    metadata,
    expiresAt: Date.now() + METADATA_CACHE_TTL_MS,
  })
  return metadata
}

export function clearLinearMetadataCache(organizationId?: string): void {
  if (organizationId) {
    metadataCache.delete(organizationId)
    return
  }
  metadataCache.clear()
}

/**
 * Resolves configured Linear fields into the UUIDs the API expects. Skips the
 * metadata round-trip when every value is already a UUID.
 */
export async function resolveLinearIssueFields(
  integration: LinearIntegration,
  accessToken: string,
  raw: RawLinearIssueFields
): Promise<ResolvedLinearIssueFields> {
  if (!fieldsNeedResolution(raw)) {
    const labelIds = normalizeLabels(raw.labelIds)
    return {
      teamId: raw.teamId.trim(),
      projectId: normalizeOptional(raw.projectId),
      assigneeId: normalizeOptional(raw.assigneeId),
      stateId: normalizeOptional(raw.stateId),
      labelIds: labelIds.length > 0 ? labelIds : undefined,
      priority: typeof raw.priority === 'number' ? raw.priority : undefined,
    }
  }

  const metadata = await getCachedLinearMetadata(integration.organizationId, accessToken)
  return resolveLinearIssueFieldsWithMetadata(metadata, raw)
}
