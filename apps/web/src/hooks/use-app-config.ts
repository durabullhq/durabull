import { useQuery } from '@tanstack/react-query'
import { api, type InferResponseType } from '@/lib/api'
import { APP_BUILD_INFO } from '@/lib/app-version'

type ServerAppConfigResponse = InferResponseType<(typeof api.app.config)['$get'], 200>

type AppPersistenceMode = ServerAppConfigResponse['persistence'] | 'unknown'

interface AppConfigResponse extends Omit<ServerAppConfigResponse, 'persistence'> {
  persistence: AppPersistenceMode
}

const FALLBACK_APP_CONFIG: AppConfigResponse = {
  authless: false,
  envConnections: false,
  persistence: 'unknown',
  stateless: false,
  environment: 'development',
  oauthProviders: {
    google: false,
    github: false,
  },
  posthog: {
    enabled: false,
    key: null,
    host: '/ingest',
    uiHost: 'https://us.posthog.com',
  },
  telemetry: {
    enabled: false,
    collectionRequired: true,
    dedupeIdentifiedPosthogEvents: false,
    disclosureUrl: 'https://durabull.io/privacy',
  },
  version: {
    version: APP_BUILD_INFO.version,
    buildId: APP_BUILD_INFO.buildId,
    buildTime: APP_BUILD_INFO.buildTime,
    releaseChannel: 'development',
    update: {
      required: false,
      reason: 'up_to_date',
    },
  },
}

export const appConfigQueryKey = ['app-config'] as const

async function fetchAppConfig(): Promise<AppConfigResponse> {
  const res = await api.app.config.$get()
  if (!res.ok) {
    throw new Error(`Failed to fetch app config: ${res.status}`)
  }
  return res.json() as Promise<ServerAppConfigResponse>
}

export function useAppConfig() {
  const { data, isLoading } = useQuery({
    queryKey: appConfigQueryKey,
    queryFn: fetchAppConfig,
    staleTime: 5 * 60 * 1000,
    retry: 3,
  })

  const config = data
    ? {
        ...data,
        version: data.version ?? FALLBACK_APP_CONFIG.version,
      }
    : FALLBACK_APP_CONFIG

  return {
    config,
    isLoading,
  }
}
