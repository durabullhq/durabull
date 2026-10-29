import { useAppConfig } from './use-app-config'

export function useAppMode() {
  const { config, isLoading } = useAppConfig()

  return {
    isAuthless: config.authless,
    envConnections: config.envConnections,
    persistence: config.persistence,
    stateless: config.stateless,
    environment: config.environment,
    hasDurablePersistence: config.persistence === 'postgres',
    /** Durabull Cloud subscriptions are active on this deployment. */
    billingEnabled: config.billing?.enabled === true,
    isLoading,
  }
}
