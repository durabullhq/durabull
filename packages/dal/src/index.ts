// Public exports - only expose the repository and types

// Re-export drizzle-orm utilities to ensure consistent versions across the monorepo
export { and, eq, or, sql } from 'drizzle-orm'

export type { Database } from './db/client'
// Database lifecycle management
export { closeDb, getDatabaseMode, getDb, getPgPool } from './db/client'
export {
  getEnvRedisConnectionId,
  getEnvRedisConnectionIdsForOrganization,
  getEnvRedisConnections,
  shouldUseEnvConnections,
} from './db/env-redis-connections'
export {
  assertRedisUrlEncryptionKeyConfigured,
  decryptRedisUrl,
  encryptRedisUrl,
  isRedisUrlEncrypted,
  isRedisUrlEncryptionKeyConfigured,
} from './db/redis-url-encryption'
export type { RedisUrlValidationResult } from './db/redis-url-validation'
export {
  allowsInternalConnections,
  validateRedisUrl,
  validateRedisUrlForEnvironment,
} from './db/redis-url-validation'
export type {
  NewTelemetryInstallation,
  TelemetryInstallation,
  Theme,
  UserSettings,
} from './db/schemas'
export { alertCheckCursor } from './db/schemas/alert-check-cursor/schema'
export type { AlertCheckCursor, NewAlertCheckCursor } from './db/schemas/alert-check-cursor/types'
export {
  type AlertDeliveryChannelType,
  type AlertDeliveryStatus,
  alertDelivery,
  alertDeliveryChannelTypes,
  alertDeliveryStatuses,
} from './db/schemas/alert-delivery/schema'
export type { AlertDelivery, NewAlertDelivery } from './db/schemas/alert-delivery/types'
export {
  type AlertDestinationConfig,
  type AlertDestinationType,
  type AlertEmailDestinationConfig,
  type AlertLinearDestinationConfig,
  type AlertSlackDestinationConfig,
  alertDestination,
  alertDestinationTypes,
  alertWebhookDestination,
  type SlackMentionMode,
  slackMentionModes,
} from './db/schemas/alert-destination/schema'
export type {
  AlertDestination,
  AlertWebhookDestination,
  NewAlertDestination,
  NewAlertWebhookDestination,
} from './db/schemas/alert-destination/types'
export {
  type AlertEventStatus,
  type AlertResolutionReason,
  alertEvent,
  alertEventStatuses,
  alertResolutionReasons,
} from './db/schemas/alert-event/schema'
export type { AlertEvent, NewAlertEvent } from './db/schemas/alert-event/types'
// Redis connection exports
export {
  type AlertRuleType,
  alertRule,
  alertRuleTypes,
  type QueueFilterMode,
  queueFilterModes,
} from './db/schemas/alert-rule/schema'
export type { AlertRule, NewAlertRule } from './db/schemas/alert-rule/types'
export * as authSchema from './db/schemas/auth/schema'
// Auth schema exports for Better Auth integration
export { authAccount, authSession, authVerification } from './db/schemas/auth/schema'
export type {
  AuthAccount,
  AuthSession,
  AuthVerification,
  NewAuthAccount,
  NewAuthSession,
  NewAuthVerification,
} from './db/schemas/auth/types'
export {
  type BillingCheckoutAttemptStatus,
  type BillingLimitsJson,
  type BillingNoticeKind,
  type BillingNoticeStatus,
  type BillingResourceKind,
  type BillingWebhookEventStatus,
  billingCheckoutAttempt,
  billingCheckoutAttemptStatuses,
  billingEntitlementOverride,
  billingNoticeDelivery,
  billingNoticeKinds,
  billingNoticeStatuses,
  billingOperatorAction,
  billingResourceKinds,
  billingResourceSuspension,
  billingSubscription,
  billingWebhookEvent,
  billingWebhookEventStatuses,
  organizationBillingAccount,
  organizationEntitlement,
} from './db/schemas/billing/schema'
export type {
  BillingCheckoutAttempt,
  BillingEntitlementOverride,
  BillingNoticeDelivery,
  BillingOperatorAction,
  BillingResourceSuspension,
  BillingSubscription,
  BillingWebhookEvent,
  OrganizationBillingAccount,
  OrganizationEntitlement,
} from './db/schemas/billing/types'
export {
  type LinearIntegrationValidationStatus,
  linearIntegration,
  linearIntegrationValidationStatuses,
} from './db/schemas/linear-integration/schema'
export type {
  LinearIntegration,
  NewLinearIntegration,
} from './db/schemas/linear-integration/types'
export { linearJobIssue } from './db/schemas/linear-job-issue/schema'
export type { LinearJobIssue, NewLinearJobIssue } from './db/schemas/linear-job-issue/types'
export { linearJobIssueEvent } from './db/schemas/linear-job-issue-event/schema'
export type {
  LinearJobIssueEvent,
  NewLinearJobIssueEvent,
} from './db/schemas/linear-job-issue-event/types'
export { linearOauthState } from './db/schemas/linear-oauth-state/schema'
export type { LinearOauthState, NewLinearOauthState } from './db/schemas/linear-oauth-state/types'
export {
  type McpPrincipalType,
  mcpAuditEvent,
  mcpPolicyBinding,
  mcpPrincipalTypes,
  mcpServiceAccount,
  mcpServiceAccountSecret,
} from './db/schemas/mcp-policy/schema'
export type {
  McpAuditEvent,
  McpPolicyBinding,
  McpServiceAccount,
  McpServiceAccountSecret,
  NewMcpAuditEvent,
  NewMcpPolicyBinding,
  NewMcpServiceAccount,
  NewMcpServiceAccountSecret,
} from './db/schemas/mcp-policy/types'
export {
  oauthAccessToken,
  oauthApplication,
  oauthConsent,
} from './db/schemas/oauth-mcp/schema'
export type {
  NewOauthAccessToken,
  NewOauthApplication,
  NewOauthConsent,
  OauthAccessToken,
  OauthApplication,
  OauthConsent,
} from './db/schemas/oauth-mcp/types'
// Organization schema exports for Better Auth organization plugin
export * as organizationSchema from './db/schemas/organization/schema'
export { invitation, member, organization } from './db/schemas/organization/schema'
export type {
  Invitation,
  Member,
  NewInvitation,
  NewMember,
  NewOrganization,
  Organization,
} from './db/schemas/organization/types'
export {
  type ConnectionEnvironment,
  connectionEnvironments,
  redisConnection,
} from './db/schemas/redis-connection/schema'
export type { NewRedisConnection, RedisConnection } from './db/schemas/redis-connection/types'
export {
  type QueueDiscoveryState,
  queueDiscoveryStates,
  redisDiscoveredQueue,
} from './db/schemas/redis-discovered-queue/schema'
export type {
  NewRedisDiscoveredQueue,
  RedisDiscoveredQueue,
} from './db/schemas/redis-discovered-queue/types'
export { redisHealthSample } from './db/schemas/redis-health-sample/schema'
export type {
  NewRedisHealthSample,
  RedisHealthSample,
} from './db/schemas/redis-health-sample/types'
export {
  type SlackAlertMessageState,
  slackAlertMessage,
  slackAlertMessageStates,
} from './db/schemas/slack-alert-message/schema'
export type {
  NewSlackAlertMessage,
  SlackAlertMessage,
} from './db/schemas/slack-alert-message/types'
export {
  type SlackInstallationStatus,
  slackInstallation,
  slackInstallationStatuses,
} from './db/schemas/slack-installation/schema'
export type {
  NewSlackInstallation,
  SlackInstallation,
} from './db/schemas/slack-installation/types'
export { slackOauthState } from './db/schemas/slack-oauth-state/schema'
export type { NewSlackOauthState, SlackOauthState } from './db/schemas/slack-oauth-state/types'
export { telemetryInstallation } from './db/schemas/telemetry-installation/schema'
export * as userSchema from './db/schemas/user/schema'
// User schema exports
export { user } from './db/schemas/user/schema'
export type { NewUser, User } from './db/schemas/user/types'
export {
  assertSecretEncryptionKeyConfigured,
  decryptSecret,
  encryptSecret,
  isSecretEncrypted,
  isSecretEncryptionKeyConfigured,
  maskSecretPreview,
} from './db/secret-encryption'
export { alertCheckCursorRepository } from './repositories/alert-check-cursor'
export { alertDeliveryRepository } from './repositories/alert-delivery'
export {
  alertDestinationRepository,
  alertWebhookDestinationRepository,
  type CreateAlertDestinationInput,
  type UpdateAlertDestinationInput,
} from './repositories/alert-destination'
export {
  type AlertEventWithAckUser,
  alertEventRepository,
  type OrganizationOpenAlertSummary,
} from './repositories/alert-event'
export { alertRuleRepository } from './repositories/alert-rule'
export {
  billingRepository,
  CAPACITY_USAGE_KEYS,
  type CapacityUsageKey,
  type PlanLimitDbViolation,
  parsePlanLimitDbError,
} from './repositories/billing'
export { linearIntegrationRepository } from './repositories/linear-integration'
export {
  type LinearIssueResolutionClaim,
  linearIssueResolutionRepository,
} from './repositories/linear-issue-resolution'
export { linearJobIssueRepository } from './repositories/linear-job-issue'
export { linearOauthStateRepository } from './repositories/linear-oauth-state'
export { mcpPolicyRepository } from './repositories/mcp-policy'
// Repositories
export { redisConnectionRepository } from './repositories/redis-connection'
export { redisDiscoveredQueueRepository } from './repositories/redis-discovered-queue'
export {
  type RedisHealthSampleBucket,
  type RedisHealthSampleInput,
  redisHealthSampleRepository,
} from './repositories/redis-health-sample'
export {
  SERVICE_ACCOUNT_TOKEN_PREFIX,
  type ServiceAccountSummary,
  serviceAccountRepository,
} from './repositories/service-account'
export {
  type CreateSlackAlertMessageInput,
  desiredSlackMessageState,
  slackAlertMessageRepository,
} from './repositories/slack-alert-message'
export {
  type SlackInstallationSettings,
  type SlackInstallationWithOrganization,
  type SlackOrganizationMember,
  slackInstallationRepository,
  type UpsertSlackInstallationInput,
} from './repositories/slack-installation'
export { hashSlackOauthState, slackOauthStateRepository } from './repositories/slack-oauth-state'
export { telemetryInstallationRepository } from './repositories/telemetry-installation'
export { userSettingsRepository } from './repositories/user-settings'
