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
  organization: {
    members: r.many.member(),
    invitations: r.many.invitation(),
    redisConnections: r.many.redisConnection(),
    alertRules: r.many.alertRule(),
    alertEvents: r.many.alertEvent(),
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
  },
  alertCheckCursor: {
    connection: r.one.redisConnection({
      from: r.alertCheckCursor.connectionId,
      to: r.redisConnection.id,
    }),
  },
}))
