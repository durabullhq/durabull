import {
  PostHogMCPAnalyticsEvent as E,
  instrument,
  PostHogMCPAnalyticsProperty as P,
  PostHog,
} from '@durabull/analytics/mcp'
import { resolvePosthogBatchUrl } from '@durabull/analytics/server'
import { env } from '@durabull/env'
import { APP_BUILD_ID } from '../../lib/build-info'
import { mcpAnalyticsContext } from './mcp-analytics-context'
import { resolveMcpPosthogIdentity } from './mcp-posthog-identity'

// One client per Bun process; request-scoped MCP servers share its batch queue.
let posthog: PostHog | undefined
const serverInstance = crypto.randomUUID()

export function instrumentMcpAnalytics(server: unknown): void {
  const token = env.POSTHOG_KEY?.trim()
  const batchUrl = resolvePosthogBatchUrl(env.POSTHOG_HOST)
  if (!token || !batchUrl || env.CI === true) return
  posthog ??= new PostHog(token, { host: new URL(batchUrl).origin })
  instrument(server, posthog, {
    serverBuild: APP_BUILD_ID,
    // Preserve the existing tool schemas and metadata-only telemetry policy.
    context: false,
    captureModel: false,
    enableConversationId: false,
    identify: async () => resolveMcpPosthogIdentity(mcpAnalyticsContext.getStore()?.identity()),
    beforeSend: (event) => {
      // Existing ingress analytics covers listings, handshakes and rejected calls.
      if (event.event !== E.ToolCall) return null
      const context = mcpAnalyticsContext.getStore()
      if (context) context.sdkToolCallCaptured = true
      const properties: Record<string, unknown> = {
        mcp_server_instance: serverInstance,
        mcp_transport: 'streamable_http',
        environment: env.NODE_ENV ?? 'development',
      }
      for (const key of [
        P.Source,
        P.ServerName,
        P.ServerVersion,
        P.ServerBuild,
        P.ToolName,
        P.DurationMs,
        P.IsError,
        P.ProtocolVersion,
        P.SessionId,
        '$groups',
        '$process_person_profile',
      ]) {
        if (event.properties?.[key] !== undefined) properties[key] = event.properties[key]
      }
      return { ...event, properties }
    },
  })
}

export async function shutdownMcpAnalytics(): Promise<void> {
  await posthog?.shutdown()
}
