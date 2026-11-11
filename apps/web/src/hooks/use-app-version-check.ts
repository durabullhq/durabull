import { useQuery } from '@tanstack/react-query'
import { type api, fetchApi, type InferResponseType } from '@/lib/api'
import { APP_BUILD_INFO } from '@/lib/app-version'

export const APP_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000

export type ServerAppVersion = InferResponseType<(typeof api.app.version)['$get'], 200>

export interface AppVersionCheckResult {
  client: typeof APP_BUILD_INFO
  server: ServerAppVersion | null
  updateRequired: boolean
  updateReason: ServerAppVersion['update']['reason'] | 'check_failed'
  isChecking: boolean
  error: Error | null
}

export const appVersionQueryKey = [
  'app-version',
  APP_BUILD_INFO.version,
  APP_BUILD_INFO.buildId,
] as const

function getVersionCheckPath(): string {
  const params = new URLSearchParams({
    clientVersion: APP_BUILD_INFO.version,
    clientBuildId: APP_BUILD_INFO.buildId,
  })

  return `/api/app/version?${params.toString()}`
}

async function fetchAppVersion(): Promise<ServerAppVersion> {
  return fetchApi<ServerAppVersion>(getVersionCheckPath(), {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
    },
  })
}

export function isAppUpdateRequired(server: ServerAppVersion | null): boolean {
  return server?.update?.required === true
}

export function useAppVersionCheck(): AppVersionCheckResult {
  const { data, error, isFetching } = useQuery({
    queryKey: appVersionQueryKey,
    queryFn: fetchAppVersion,
    refetchInterval: APP_VERSION_CHECK_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: 2,
    staleTime: 0,
  })

  return {
    client: APP_BUILD_INFO,
    server: data ?? null,
    updateRequired: isAppUpdateRequired(data ?? null),
    updateReason: data?.update?.reason ?? (error ? 'check_failed' : 'up_to_date'),
    isChecking: isFetching,
    error: error instanceof Error ? error : null,
  }
}
