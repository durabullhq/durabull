/**
 * Export all table schemas without relations.
 * This file exists to avoid circular dependencies in the relations definition.
 */

// Alert schema tables
export { alertCheckCursor } from './alert-check-cursor/schema'
export { alertDelivery } from './alert-delivery/schema'
export { alertEvent } from './alert-event/schema'
export { alertRule } from './alert-rule/schema'
export { alertDestination } from './alert-destination/schema'
// Auth schema tables
export { authAccount, authSession, authVerification } from './auth/schema'
export { linearIntegration } from './linear-integration/schema'
export { linearJobIssue } from './linear-job-issue/schema'
export { linearJobIssueEvent } from './linear-job-issue-event/schema'
export { linearOauthState } from './linear-oauth-state/schema'
export {
  mcpAuditEvent,
  mcpPolicyBinding,
  mcpServiceAccount,
  mcpServiceAccountSecret,
} from './mcp-policy/schema'
export { oauthAccessToken, oauthApplication, oauthConsent } from './oauth-mcp/schema'
// Organization schema tables
export { invitation, member, organization } from './organization/schema'
// Redis Connection schema tables
export { connectionEnvironments, redisConnection } from './redis-connection/schema'
export { redisDiscoveredQueue } from './redis-discovered-queue/schema'
// Telemetry installation schema tables
export { telemetryInstallation } from './telemetry-installation/schema'
// User schema tables
export { user } from './user/schema'
// User settings schema tables
export { userSettings } from './user-settings/schema'
