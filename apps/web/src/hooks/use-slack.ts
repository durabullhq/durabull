import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, handleRes } from '@/lib/api'
import { alertKeys } from './use-alerts'
import { useActiveOrganization } from './use-organization'

export type SlackInstallationStatus = 'active' | 'revoked'

export interface SlackInstallationRecord {
  id: string
  status: SlackInstallationStatus
  statusReason: string | null
  slackTeamId: string
  slackTeamName: string
  slackTeamUrl: string | null
  botUserId: string
  scopes: string
  missingScopes: string[]
  actionsEnabled: boolean
  unfurlsEnabled: boolean
  slackDestinationCount: number
  lastValidatedAt: string | null
  createdAt: string | null
}

export interface SlackIntegrationOverview {
  /** The deployment has Slack app credentials. */
  configured: boolean
  /** The organization's plan includes the Slack app. */
  entitled: boolean
  installation: SlackInstallationRecord | null
}

export interface SlackChannelRecord {
  id: string
  name: string
  isPrivate: boolean
  isMember: boolean
}

export interface SlackUserGroupRecord {
  id: string
  handle: string
  name: string
}

export const slackKeys = {
  all: ['slack'] as const,
  overview: (organizationId?: string | null) => ['slack', organizationId ?? 'none'] as const,
  channels: (organizationId?: string | null) =>
    ['slack', organizationId ?? 'none', 'channels'] as const,
  userGroups: (organizationId?: string | null) =>
    ['slack', organizationId ?? 'none', 'user-groups'] as const,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : value instanceof Date ? value.toISOString() : null
}

export function normalizeSlackInstallation(value: unknown): SlackInstallationRecord | null {
  if (!isRecord(value)) return null
  return {
    id: asString(value.id) ?? '',
    status: value.status === 'revoked' ? 'revoked' : 'active',
    statusReason: asString(value.statusReason),
    slackTeamId: asString(value.slackTeamId) ?? '',
    slackTeamName: asString(value.slackTeamName) ?? 'Slack workspace',
    slackTeamUrl: asString(value.slackTeamUrl),
    botUserId: asString(value.botUserId) ?? '',
    scopes: asString(value.scopes) ?? '',
    missingScopes: Array.isArray(value.missingScopes)
      ? value.missingScopes.filter((scope): scope is string => typeof scope === 'string')
      : [],
    actionsEnabled: value.actionsEnabled !== false,
    unfurlsEnabled: value.unfurlsEnabled !== false,
    slackDestinationCount:
      typeof value.slackDestinationCount === 'number' ? value.slackDestinationCount : 0,
    lastValidatedAt: asString(value.lastValidatedAt),
    createdAt: asString(value.createdAt),
  }
}

export function useSlackIntegration() {
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id
  return useQuery({
    queryKey: slackKeys.overview(organizationId),
    queryFn: async (): Promise<SlackIntegrationOverview> => {
      const data = await handleRes<Record<string, unknown>>(await api.integrations.slack.$get())
      return {
        configured: data.configured === true,
        entitled: data.entitled !== false,
        installation: normalizeSlackInstallation(data.installation),
      }
    },
    enabled: Boolean(organizationId),
  })
}

export function useConnectSlack() {
  return useMutation({
    mutationFn: async (input: { returnTo?: 'integrations' | 'destinations' } = {}) =>
      handleRes<{ authorizationUrl: string }>(
        await api.integrations.slack.connect.$post({ json: input })
      ),
    onSuccess: ({ authorizationUrl }) => {
      window.location.assign(authorizationUrl)
    },
  })
}

function useInvalidateSlack() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: slackKeys.all })
    void queryClient.invalidateQueries({ queryKey: alertKeys.all })
  }
}

export function useUpdateSlackSettings() {
  const invalidate = useInvalidateSlack()
  return useMutation({
    mutationFn: async (input: { actionsEnabled?: boolean; unfurlsEnabled?: boolean }) => {
      const data = await handleRes<{ installation: unknown }>(
        await api.integrations.slack.$patch({ json: input })
      )
      return normalizeSlackInstallation(data.installation)
    },
    onSuccess: invalidate,
  })
}

export function useDisconnectSlack() {
  const invalidate = useInvalidateSlack()
  return useMutation({
    mutationFn: async () =>
      handleRes<{ success: boolean; revokedToken: boolean }>(
        await api.integrations.slack.$delete()
      ),
    onSuccess: invalidate,
  })
}

export function useTestSlack() {
  const invalidate = useInvalidateSlack()
  return useMutation({
    mutationFn: async () =>
      handleRes<{ ok: boolean; teamName: string; url: string | null }>(
        await api.integrations.slack.test.$post()
      ),
    onSettled: invalidate,
  })
}

export function useSlackChannels(enabled: boolean) {
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: slackKeys.channels(organizationId),
    queryFn: async () =>
      handleRes<{ channels: SlackChannelRecord[]; truncated: boolean }>(
        await api.integrations.slack.channels.$get({ query: {} })
      ),
    enabled: enabled && Boolean(organizationId),
    staleTime: 60_000,
  })
  const refresh = async () => {
    const data = await handleRes<{ channels: SlackChannelRecord[]; truncated: boolean }>(
      await api.integrations.slack.channels.$get({ query: { refresh: 'true' } })
    )
    queryClient.setQueryData(slackKeys.channels(organizationId), data)
  }
  return { ...query, refresh }
}

export function useSlackUserGroups(enabled: boolean) {
  const { data: activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id
  return useQuery({
    queryKey: slackKeys.userGroups(organizationId),
    queryFn: async () =>
      handleRes<{ userGroups: SlackUserGroupRecord[] }>(
        await api.integrations.slack['user-groups'].$get()
      ),
    enabled: enabled && Boolean(organizationId),
    staleTime: 5 * 60_000,
  })
}

export function useSlackManifest(enabled: boolean) {
  return useQuery({
    queryKey: ['slack', 'manifest'],
    queryFn: async () =>
      handleRes<{ manifest: Record<string, unknown> }>(
        await api.integrations.slack.manifest.$get()
      ),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  })
}
