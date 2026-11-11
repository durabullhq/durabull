import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useMemo } from 'react'
import { useAppMode } from '@/hooks/use-app-mode'
import { useAuth } from '@/hooks/use-auth'
import { ApiError, api, type InferResponseType } from '@/lib/api'

// Type helpers using Hono's InferResponseType
type ListConnectionsResponse = InferResponseType<(typeof api.connections)['$get'], 200>
type Connection = ListConnectionsResponse['connections'][number]

interface ConnectionContextValue {
  connections: Connection[]
  currentConnection: Connection | null
  setCurrentConnection: (connection: Connection) => void
  isLoading: boolean
  error: Error | null
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null)

// Query key for connections
export const connectionsQueryKey = ['connections'] as const

async function fetchConnections(): Promise<Connection[]> {
  const res = await api.connections.$get()
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    // The message explains the cause (for example a paused seat); `error` is only its category.
    throw new ApiError(data.message || data.error || `API error: ${res.status}`, res.status, data)
  }
  const data = await res.json()
  return data.connections
}

/** Enabled and not paused by the plan: its queues, workers and alerts are reachable. */
export function isUsableConnection(connection: Pick<Connection, 'enabled' | 'suspended'>): boolean {
  return connection.enabled !== false && connection.suspended !== true
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { isAuthless } = useAppMode()
  // Get orgSlug and connectionId from route params
  const params = useParams({ strict: false }) as { orgSlug?: string; connectionId?: string }
  const { orgSlug, connectionId: connectionIdFromUrl } = params

  // Fetch connections with TanStack Query - handles caching, deduplication, etc.
  // Authless mode should fetch immediately even before session resolution settles.
  const {
    data: connections = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: connectionsQueryKey,
    queryFn: fetchConnections,
    staleTime: 30_000, // Consider fresh for 30 seconds
    enabled: isAuthless || isAuthenticated,
  })

  // Determine current connection from URL or default
  const currentConnection = useMemo(() => {
    if (connections.length === 0) return null

    // If URL has a connection ID, use that
    if (connectionIdFromUrl) {
      const fromUrl = connections.find((c) => c.id === connectionIdFromUrl)
      if (fromUrl) return fromUrl
    }

    // Without an explicit choice, never land on a connection that cannot be
    // used: one the plan has paused, or one that is disabled.
    const usable = connections.filter(isUsableConnection)
    const candidates = usable.length > 0 ? usable : connections

    // Otherwise use the default connection from API
    const defaultConnection = candidates.find((c) => c.isDefault)
    if (defaultConnection) return defaultConnection

    // Fallback to first connection
    return candidates[0] ?? null
  }, [connections, connectionIdFromUrl])

  const setCurrentConnection = useCallback(
    (connection: Connection) => {
      if (!orgSlug) return

      // Navigate to the new connection's home page (queues dashboard)
      // This is simpler than trying to preserve the current sub-route
      navigate({
        to: '/$orgSlug/c/$connectionId',
        params: { orgSlug, connectionId: connection.id },
      })
    },
    [navigate, orgSlug]
  )

  const value = useMemo(
    () => ({
      connections,
      currentConnection,
      setCurrentConnection,
      isLoading,
      error,
    }),
    [connections, currentConnection, setCurrentConnection, isLoading, error]
  )

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
}

export function useConnection() {
  const context = useContext(ConnectionContext)
  if (!context) {
    throw new Error('useConnection must be used within a ConnectionProvider')
  }
  return context
}
