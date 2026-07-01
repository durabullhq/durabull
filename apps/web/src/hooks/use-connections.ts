/**
 * Connection-related hooks using Hono RPC client
 * Types are automatically inferred from the server via InferResponseType
 */

import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { connectionsQueryKey } from '@/components/connection-provider'
import { api, handleRes, type InferResponseType } from '@/lib/api'

// Type helpers using Hono's InferResponseType
type GetConnectionResponse = InferResponseType<(typeof api.connections)[':id']['$get'], 200>
type CreateConnectionResponse = InferResponseType<(typeof api.connections)['$post'], 201>
type UpdateConnectionResponse = InferResponseType<(typeof api.connections)[':id']['$patch'], 200>
type DeleteConnectionResponse = InferResponseType<(typeof api.connections)[':id']['$delete'], 200>
type TestConnectionResponse = InferResponseType<(typeof api.connections.test)['$post'], 200>
type QueueDiscoveryResponse = InferResponseType<
  (typeof api.c)[':connectionId']['queues']['discovery']['$get'],
  200
>

/**
 * Query key factory for connection queries
 */
export const connectionKeys = {
  all: ['connections'] as const,
  detail: (id: string) => ['connections', id] as const,
  queueDiscovery: (id: string) => ['connections', id, 'queue-discovery'] as const,
}

// Get a single connection with full details
export function useConnectionDetail(id: string | null) {
  return useQuery({
    queryKey: connectionKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await api.connections[':id'].$get({
        param: { id: id! },
      })
      const data = await handleRes<GetConnectionResponse>(res)
      return data.connection
    },
    enabled: !!id,
  })
}

// Create connection mutation
export function useCreateConnection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      name: string
      url: string
      environment?: 'development' | 'staging' | 'production'
      isDefault?: boolean
      prefix?: string
      allowSelfSignedCerts?: boolean
      mode?: 'standalone' | 'cluster'
    }) => {
      const res = await api.connections.$post({
        json: data,
      })
      const result = await handleRes<CreateConnectionResponse>(res)
      return { connection: result.connection, inputData: data }
    },
    onSuccess: ({ connection, inputData }) => {
      trackEvent(AnalyticsEvents.CONNECTION_CREATED, {
        connection_id: connection.id,
        connection_name: connection.name,
        connection_environment: inputData.environment,
        is_default: inputData.isDefault,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: connectionKeys.all })
      queryClient.invalidateQueries({ queryKey: connectionsQueryKey })
    },
    onError: (_, variables) => {
      trackEvent(AnalyticsEvents.CONNECTION_CREATED, {
        connection_name: variables.name,
        connection_environment: variables.environment,
        is_default: variables.isDefault,
        success: false,
      })
    },
  })
}

// Update connection mutation
export function useUpdateConnection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string
      data: {
        name?: string
        url?: string
        environment?: 'development' | 'staging' | 'production'
        isDefault?: boolean
        prefix?: string
        allowSelfSignedCerts?: boolean
        mode?: 'standalone' | 'cluster'
      }
    }) => {
      const res = await api.connections[':id'].$patch({
        param: { id },
        json: data,
      })
      const result = await handleRes<UpdateConnectionResponse>(res)
      return { connection: result.connection, inputData: data }
    },
    onSuccess: ({ connection, inputData }, { id }) => {
      trackEvent(AnalyticsEvents.CONNECTION_UPDATED, {
        connection_id: id,
        connection_name: connection.name,
        connection_environment: inputData.environment,
        is_default: inputData.isDefault,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: connectionKeys.all })
      queryClient.invalidateQueries({ queryKey: connectionKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: connectionsQueryKey })
    },
    onError: (_, variables) => {
      trackEvent(AnalyticsEvents.CONNECTION_UPDATED, {
        connection_id: variables.id,
        connection_name: variables.data.name,
        connection_environment: variables.data.environment,
        success: false,
      })
    },
  })
}

// Delete connection mutation
export function useDeleteConnection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.connections[':id'].$delete({
        param: { id },
      })
      const result = await handleRes<DeleteConnectionResponse>(res)
      return { ...result, connectionId: id }
    },
    onSuccess: (data) => {
      trackEvent(AnalyticsEvents.CONNECTION_DELETED, {
        connection_id: data.connectionId,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: connectionKeys.all })
      queryClient.invalidateQueries({ queryKey: connectionsQueryKey })
    },
    onError: (_, connectionId) => {
      trackEvent(AnalyticsEvents.CONNECTION_DELETED, {
        connection_id: connectionId,
        success: false,
      })
    },
  })
}

// Test connection mutation
export function useTestConnection() {
  return useMutation({
    mutationFn: async ({
      url,
      allowSelfSignedCerts,
      mode,
    }: {
      url: string
      allowSelfSignedCerts?: boolean
      mode?: 'standalone' | 'cluster'
    }) => {
      const res = await api.connections.test.$post({
        json: { url, allowSelfSignedCerts, mode },
      })
      return handleRes<TestConnectionResponse>(res)
    },
    onSuccess: () => {
      trackEvent(AnalyticsEvents.CONNECTION_TESTED, {
        success: true,
      })
    },
    onError: (error) => {
      trackEvent(AnalyticsEvents.CONNECTION_TESTED, {
        success: false,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })
}

// Set connection as default
export function useSetDefaultConnection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.connections[':id'].$patch({
        param: { id },
        json: { isDefault: true },
      })
      const result = await handleRes<UpdateConnectionResponse>(res)
      return { connection: result.connection, connectionId: id }
    },
    onSuccess: ({ connection, connectionId }) => {
      trackEvent(AnalyticsEvents.CONNECTION_SET_DEFAULT, {
        connection_id: connectionId,
        connection_name: connection.name,
        success: true,
      })
      queryClient.invalidateQueries({ queryKey: connectionKeys.all })
      queryClient.invalidateQueries({ queryKey: connectionsQueryKey })
    },
    onError: (_, connectionId) => {
      trackEvent(AnalyticsEvents.CONNECTION_SET_DEFAULT, {
        connection_id: connectionId,
        success: false,
      })
    },
  })
}

export function useRunConnectionQueueDiscovery() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await api.c[':connectionId'].queues.discovery.$post({
        param: { connectionId },
      })
      return handleRes<QueueDiscoveryResponse>(res)
    },
    onSuccess: (_, connectionId) => {
      queryClient.invalidateQueries({ queryKey: connectionKeys.queueDiscovery(connectionId) })
      queryClient.invalidateQueries({ queryKey: ['queues', connectionId] })
    },
  })
}

export function useConnectionQueueDiscoveryStatus(connectionId: string | null, enabled = true) {
  return useQuery({
    queryKey: connectionKeys.queueDiscovery(connectionId ?? ''),
    queryFn: async () => {
      const res = await api.c[':connectionId'].queues.discovery.$get({
        param: { connectionId: connectionId! },
      })
      return handleRes<QueueDiscoveryResponse>(res)
    },
    enabled: !!connectionId && enabled,
    refetchInterval: (query) => (query.state.data?.running ? 2000 : false),
  })
}
