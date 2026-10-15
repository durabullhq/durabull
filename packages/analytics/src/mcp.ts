// Server-only: keep the MCP SDK out of the browser analytics entrypoints.
export {
  instrument,
  POSTHOG_MCP_ANALYTICS_SOURCE,
  PostHogMCPAnalyticsEvent,
  PostHogMCPAnalyticsProperty,
} from '@posthog/mcp'
export { PostHog } from 'posthog-node'
