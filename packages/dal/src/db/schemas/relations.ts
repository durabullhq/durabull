import { defineRelations } from 'drizzle-orm'
import * as tables from './tables'

/**
 * All relations are defined in this single file to avoid circular dependencies.
 * Schema files only define tables, and this file defines how they relate to each other.
 *
 * This uses Drizzle Relations v2 syntax (defineRelations)
 */

export const relations = defineRelations(tables, (r) => ({
  user: {
    sessions: r.many.authSession(),
    accounts: r.many.authAccount(),
    memberships: r.many.member(),
    invitationsSent: r.many.invitation({
      from: r.user.id,
      to: r.invitation.inviterId,
    }),
  },
  authSession: {
    user: r.one.user({
      from: r.authSession.userId,
      to: r.user.id,
    }),
    activeOrganization: r.one.organization({
      from: r.authSession.activeOrganizationId,
      to: r.organization.id,
    }),
  },
  authAccount: {
    user: r.one.user({
      from: r.authAccount.userId,
      to: r.user.id,
    }),
  },
  oauthApplication: {
    user: r.one.user({
      from: r.oauthApplication.userId,
      to: r.user.id,
    }),
    accessTokens: r.many.oauthAccessToken(),
    consents: r.many.oauthConsent(),
  },
  oauthAccessToken: {
    application: r.one.oauthApplication({
      from: r.oauthAccessToken.clientId,
      to: r.oauthApplication.clientId,
    }),
    user: r.one.user({
      from: r.oauthAccessToken.userId,
      to: r.user.id,
    }),
  },
  oauthConsent: {
    application: r.one.oauthApplication({
      from: r.oauthConsent.clientId,
      to: r.oauthApplication.clientId,
    }),
    user: r.one.user({
      from: r.oauthConsent.userId,
      to: r.user.id,
    }),
  },
  mcpServiceAccount: {
    organization: r.one.organization({
      from: r.mcpServiceAccount.organizationId,
      to: r.organization.id,
    }),
    oauthApplication: r.one.oauthApplication({
      from: r.mcpServiceAccount.oauthClientId,
      to: r.oauthApplication.clientId,
    }),
    secrets: r.many.mcpServiceAccountSecret(),
  },
  mcpServiceAccountSecret: {
    serviceAccount: r.one.mcpServiceAccount({
      from: r.mcpServiceAccountSecret.serviceAccountId,
      to: r.mcpServiceAccount.id,
    }),
    createdByUser: r.one.user({
      from: r.mcpServiceAccountSecret.createdByUserId,
      to: r.user.id,
    }),
  },
  organization: {
    members: r.many.member(),
    invitations: r.many.invitation(),
    redisConnections: r.many.redisConnection(),
    alertRules: r.many.alertRule(),
    alertEvents: r.many.alertEvent(),
    alertWebhookDestinations: r.many.alertWebhookDestination(),
    linearIntegration: r.one.linearIntegration(),
    linearOauthStates: r.many.linearOauthState(),
    linearJobIssues: r.many.linearJobIssue(),
    mcpServiceAccounts: r.many.mcpServiceAccount(),
  },
  member: {
    user: r.one.user({
      from: r.member.userId,
      to: r.user.id,
    }),
    organization: r.one.organization({
      from: r.member.organizationId,
      to: r.organization.id,
    }),
  },
  invitation: {
    organization: r.one.organization({
      from: r.invitation.organizationId,
      to: r.organization.id,
    }),
    inviter: r.one.user({
      from: r.invitation.inviterId,
      to: r.user.id,
    }),
  },
  redisConnection: {
    organization: r.one.organization({
      from: r.redisConnection.organizationId,
      to: r.organization.id,
    }),
    discoveredQueues: r.many.redisDiscoveredQueue(),
    alertRules: r.many.alertRule(),
    alertEvents: r.many.alertEvent(),
    alertCheckCursors: r.many.alertCheckCursor(),
    linearJobIssues: r.many.linearJobIssue(),
  },
  redisDiscoveredQueue: {
    connection: r.one.redisConnection({
      from: r.redisDiscoveredQueue.connectionId,
      to: r.redisConnection.id,
    }),
  },
  alertRule: {
    organization: r.one.organization({
      from: r.alertRule.organizationId,
      to: r.organization.id,
    }),
    connection: r.one.redisConnection({
      from: r.alertRule.connectionId,
      to: r.redisConnection.id,
    }),
    events: r.many.alertEvent(),
  },
  alertEvent: {
    rule: r.one.alertRule({
      from: r.alertEvent.alertRuleId,
      to: r.alertRule.id,
    }),
    organization: r.one.organization({
      from: r.alertEvent.organizationId,
      to: r.organization.id,
    }),
    connection: r.one.redisConnection({
      from: r.alertEvent.connectionId,
      to: r.redisConnection.id,
    }),
    deliveries: r.many.alertDelivery(),
    linearJobIssueEvents: r.many.linearJobIssueEvent(),
  },
  alertCheckCursor: {
    connection: r.one.redisConnection({
      from: r.alertCheckCursor.connectionId,
      to: r.redisConnection.id,
    }),
  },
  alertDelivery: {
    event: r.one.alertEvent({
      from: r.alertDelivery.alertEventId,
      to: r.alertEvent.id,
    }),
    organization: r.one.organization({
      from: r.alertDelivery.organizationId,
      to: r.organization.id,
    }),
  },
  alertWebhookDestination: {
    organization: r.one.organization({
      from: r.alertWebhookDestination.organizationId,
      to: r.organization.id,
    }),
  },
  linearIntegration: {
    organization: r.one.organization({
      from: r.linearIntegration.organizationId,
      to: r.organization.id,
    }),
  },
  linearOauthState: {
    organization: r.one.organization({
      from: r.linearOauthState.organizationId,
      to: r.organization.id,
    }),
  },
  linearJobIssue: {
    organization: r.one.organization({
      from: r.linearJobIssue.organizationId,
      to: r.organization.id,
    }),
    connection: r.one.redisConnection({
      from: r.linearJobIssue.connectionId,
      to: r.redisConnection.id,
    }),
    eventLinks: r.many.linearJobIssueEvent(),
  },
  linearJobIssueEvent: {
    issue: r.one.linearJobIssue({
      from: r.linearJobIssueEvent.linearJobIssueId,
      to: r.linearJobIssue.id,
    }),
    event: r.one.alertEvent({
      from: r.linearJobIssueEvent.alertEventId,
      to: r.alertEvent.id,
    }),
  },
}))
