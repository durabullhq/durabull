import { alertDeliveryRepository, alertEventRepository, alertRuleRepository } from '@durabull/dal'
import type {
  AlertEventMutationHandlerInput,
  AlertEventMutationHandlerOutput,
  GetAlertEventHandlerInput,
  GetAlertEventHandlerOutput,
  GetAlertSummaryHandlerInput,
  GetAlertSummaryHandlerOutput,
} from '@durabull/mcp'

import {
  computeAlertRuleState,
  sanitizeMcpText,
  toMcpAlertEventDetail,
  toMcpAlertEventSummary,
} from './mcp-sanitize'
import { McpToolError, type ResolvedToolConnection, requireConnectionForPrincipal } from './shared'

/** Open events sampled for the by-queue / by-rule breakdown in get_alert_summary. */
export const ALERT_SUMMARY_SAMPLE_LIMIT = 500
/** Breakdown rows returned; matches the MCP output sanitizer's array cap so nothing is cut silently. */
export const ALERT_SUMMARY_BREAKDOWN_LIMIT = 100

interface AlertEventHandlerDeps {
  requireConnectionForPrincipal: typeof requireConnectionForPrincipal
  findEvent: typeof alertEventRepository.findById
  findEvents: typeof alertEventRepository.findByConnection
  countEvents: typeof alertEventRepository.countByConnection
  acknowledge: typeof alertEventRepository.acknowledge
  unacknowledge: typeof alertEventRepository.unacknowledge
  listDeliveries: typeof alertDeliveryRepository.listByEvent
  findRules: typeof alertRuleRepository.findByConnection
}

const defaultDeps: AlertEventHandlerDeps = {
  requireConnectionForPrincipal,
  findEvent: alertEventRepository.findById,
  findEvents: alertEventRepository.findByConnection,
  countEvents: alertEventRepository.countByConnection,
  acknowledge: alertEventRepository.acknowledge,
  unacknowledge: alertEventRepository.unacknowledge,
  listDeliveries: alertDeliveryRepository.listByEvent,
  findRules: alertRuleRepository.findByConnection,
}

async function requireEventOnConnection(
  deps: AlertEventHandlerDeps,
  connection: ResolvedToolConnection,
  eventId: string
) {
  const event = await deps.findEvent(eventId, connection.organizationId)
  if (!event || event.connectionId !== connection.id) {
    throw new McpToolError('not_found', `Alert event ${eventId} not found.`)
  }
  return event
}

export function createGetAlertEventHandler(deps: AlertEventHandlerDeps = defaultDeps) {
  return async function getAlertEventHandler(
    input: GetAlertEventHandlerInput
  ): Promise<GetAlertEventHandlerOutput> {
    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)
    const event = await requireEventOnConnection(deps, connection, input.eventId)
    const deliveries = await deps.listDeliveries(event.id)
    return {
      connectionId: connection.id,
      event: toMcpAlertEventDetail(event, deliveries),
    }
  }
}

export function createGetAlertSummaryHandler(deps: AlertEventHandlerDeps = defaultDeps) {
  return async function getAlertSummaryHandler(
    input: GetAlertSummaryHandlerInput
  ): Promise<GetAlertSummaryHandlerOutput> {
    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)

    const [firing, acknowledged, sample, rules] = await Promise.all([
      deps.countEvents(connection.id, connection.organizationId, {
        status: 'firing',
        acknowledged: false,
      }),
      deps.countEvents(connection.id, connection.organizationId, {
        status: 'firing',
        acknowledged: true,
      }),
      deps.findEvents(connection.id, connection.organizationId, {
        status: 'firing',
        offset: 0,
        limit: ALERT_SUMMARY_SAMPLE_LIMIT,
      }),
      deps.findRules(connection.id, connection.organizationId),
    ])

    const ruleNames = new Map(rules.map((rule) => [rule.id, sanitizeMcpText(rule.name)]))
    const byQueue = new Map<string, number>()
    const byRule = new Map<string, number>()
    for (const event of sample) {
      byQueue.set(event.queueName, (byQueue.get(event.queueName) ?? 0) + 1)
      byRule.set(event.alertRuleId, (byRule.get(event.alertRuleId) ?? 0) + 1)
    }

    const ruleStates = { total: rules.length, active: 0, snoozed: 0, disabled: 0 }
    for (const rule of rules) {
      ruleStates[computeAlertRuleState(rule)] += 1
    }

    const open = firing + acknowledged
    return {
      connectionId: connection.id,
      open,
      firing,
      acknowledged,
      byQueue: [...byQueue.entries()]
        .map(([queueName, count]) => ({ queueName, open: count }))
        .sort((left, right) => right.open - left.open)
        .slice(0, ALERT_SUMMARY_BREAKDOWN_LIMIT),
      byRule: [...byRule.entries()]
        .map(([alertRuleId, count]) => ({
          alertRuleId,
          ruleName: ruleNames.get(alertRuleId) ?? null,
          open: count,
        }))
        .sort((left, right) => right.open - left.open)
        .slice(0, ALERT_SUMMARY_BREAKDOWN_LIMIT),
      rules: ruleStates,
      truncated: open > sample.length,
    }
  }
}

export function createAcknowledgeAlertEventHandler(deps: AlertEventHandlerDeps = defaultDeps) {
  return async function acknowledgeAlertEventHandler(
    input: AlertEventMutationHandlerInput
  ): Promise<AlertEventMutationHandlerOutput> {
    if (input.principal.type !== 'delegated_user') {
      throw new McpToolError(
        'validation_error',
        'acknowledge_alert_event records who acknowledged the incident and therefore requires a signed-in user token; service accounts cannot acknowledge.'
      )
    }

    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)
    const existing = await requireEventOnConnection(deps, connection, input.eventId)
    if (existing.status !== 'firing') {
      throw new McpToolError(
        'conflict',
        `Only firing alert events can be acknowledged; this event is ${existing.status}.`
      )
    }
    if (existing.acknowledgedAt) {
      throw new McpToolError('conflict', 'This alert event is already acknowledged.')
    }

    const event = await deps.acknowledge(
      existing.id,
      connection.organizationId,
      input.principal.userId
    )
    if (!event) {
      throw new McpToolError('conflict', 'The alert event changed before it could be acknowledged.')
    }

    return { connectionId: connection.id, event: toMcpAlertEventSummary(event) }
  }
}

export function createUnacknowledgeAlertEventHandler(deps: AlertEventHandlerDeps = defaultDeps) {
  return async function unacknowledgeAlertEventHandler(
    input: AlertEventMutationHandlerInput
  ): Promise<AlertEventMutationHandlerOutput> {
    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)
    const existing = await requireEventOnConnection(deps, connection, input.eventId)
    if (existing.status !== 'firing') {
      throw new McpToolError(
        'conflict',
        `Only firing alert events can be unacknowledged; this event is ${existing.status}.`
      )
    }
    if (!existing.acknowledgedAt) {
      throw new McpToolError('conflict', 'This alert event is not acknowledged.')
    }

    const event = await deps.unacknowledge(existing.id, connection.organizationId)
    if (!event) {
      throw new McpToolError(
        'conflict',
        'The alert event changed before it could be unacknowledged.'
      )
    }

    return { connectionId: connection.id, event: toMcpAlertEventSummary(event) }
  }
}

export const getAlertEventHandler = createGetAlertEventHandler()
export const getAlertSummaryHandler = createGetAlertSummaryHandler()
export const acknowledgeAlertEventHandler = createAcknowledgeAlertEventHandler()
export const unacknowledgeAlertEventHandler = createUnacknowledgeAlertEventHandler()
