import { alertEventRepository, alertRuleRepository } from '@durabull/dal'
import type {
  AlertRuleMutationHandlerInput,
  AlertRuleMutationHandlerOutput,
  GetAlertRuleHandlerInput,
  GetAlertRuleHandlerOutput,
  ListAlertRulesHandlerInput,
  ListAlertRulesHandlerOutput,
  SnoozeAlertRuleHandlerInput,
} from '@durabull/mcp'

import { toMcpAlertEventSummary, toMcpAlertRuleSummary } from './mcp-sanitize'
import {
  McpToolError,
  mapWithConcurrency,
  parseOffsetPageSize,
  type ResolvedToolConnection,
  requireConnectionForPrincipal,
} from './shared'

const MAX_SNOOZE_MINUTES = 10_080
const RECENT_EVENTS_PER_RULE = 5

interface AlertRuleHandlerDeps {
  requireConnectionForPrincipal: typeof requireConnectionForPrincipal
  findRules: typeof alertRuleRepository.findByConnection
  findRule: typeof alertRuleRepository.findById
  setMutedUntil: typeof alertRuleRepository.setMutedUntil
  countEvents: typeof alertEventRepository.countByConnection
  findEvents: typeof alertEventRepository.findByConnection
}

const defaultDeps: AlertRuleHandlerDeps = {
  requireConnectionForPrincipal,
  findRules: alertRuleRepository.findByConnection,
  findRule: alertRuleRepository.findById,
  setMutedUntil: alertRuleRepository.setMutedUntil,
  countEvents: alertEventRepository.countByConnection,
  findEvents: alertEventRepository.findByConnection,
}

async function openEventCount(
  deps: AlertRuleHandlerDeps,
  connection: ResolvedToolConnection,
  ruleId: string
): Promise<number> {
  return deps.countEvents(connection.id, connection.organizationId, {
    alertRuleId: ruleId,
    status: 'firing',
  })
}

async function requireRuleOnConnection(
  deps: AlertRuleHandlerDeps,
  connection: ResolvedToolConnection,
  ruleId: string
) {
  const rule = await deps.findRule(ruleId, connection.organizationId)
  if (!rule || rule.connectionId !== connection.id) {
    throw new McpToolError('not_found', `Alert rule ${ruleId} not found.`)
  }
  return rule
}

export function createListAlertRulesHandler(deps: AlertRuleHandlerDeps = defaultDeps) {
  return async function listAlertRulesHandler(
    input: ListAlertRulesHandlerInput
  ): Promise<ListAlertRulesHandlerOutput> {
    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)
    const { offset, limit } = parseOffsetPageSize(input.cursor, input.pageSize)

    const rules = await deps.findRules(connection.id, connection.organizationId)
    const page = rules.slice(offset, offset + limit)
    const summaries = await mapWithConcurrency(page, 4, async (rule) =>
      toMcpAlertRuleSummary(rule, await openEventCount(deps, connection, rule.id))
    )
    const nextOffset = offset + page.length

    return {
      connectionId: connection.id,
      total: rules.length,
      rules: summaries,
      nextCursor: nextOffset < rules.length ? String(nextOffset) : null,
    }
  }
}

export function createGetAlertRuleHandler(deps: AlertRuleHandlerDeps = defaultDeps) {
  return async function getAlertRuleHandler(
    input: GetAlertRuleHandlerInput
  ): Promise<GetAlertRuleHandlerOutput> {
    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)
    const rule = await requireRuleOnConnection(deps, connection, input.ruleId)

    const [open, recent] = await Promise.all([
      openEventCount(deps, connection, rule.id),
      deps.findEvents(connection.id, connection.organizationId, {
        alertRuleId: rule.id,
        offset: 0,
        limit: RECENT_EVENTS_PER_RULE,
      }),
    ])

    return {
      connectionId: connection.id,
      rule: toMcpAlertRuleSummary(rule, open),
      recentEvents: recent.map((event) => toMcpAlertEventSummary(event)),
    }
  }
}

export function createSnoozeAlertRuleHandler(deps: AlertRuleHandlerDeps = defaultDeps) {
  return async function snoozeAlertRuleHandler(
    input: SnoozeAlertRuleHandlerInput
  ): Promise<AlertRuleMutationHandlerOutput> {
    const minutes = Math.floor(input.minutes)
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_SNOOZE_MINUTES) {
      throw new McpToolError(
        'validation_error',
        `minutes must be between 1 and ${MAX_SNOOZE_MINUTES}.`
      )
    }

    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)
    await requireRuleOnConnection(deps, connection, input.ruleId)

    const rule = await deps.setMutedUntil(
      input.ruleId,
      connection.organizationId,
      new Date(Date.now() + minutes * 60_000)
    )
    if (!rule) {
      throw new McpToolError('not_found', `Alert rule ${input.ruleId} not found.`)
    }

    return {
      connectionId: connection.id,
      rule: toMcpAlertRuleSummary(rule, await openEventCount(deps, connection, rule.id)),
    }
  }
}

export function createUnsnoozeAlertRuleHandler(deps: AlertRuleHandlerDeps = defaultDeps) {
  return async function unsnoozeAlertRuleHandler(
    input: AlertRuleMutationHandlerInput
  ): Promise<AlertRuleMutationHandlerOutput> {
    const connection = await deps.requireConnectionForPrincipal(input.principal, input.connectionId)
    await requireRuleOnConnection(deps, connection, input.ruleId)

    const rule = await deps.setMutedUntil(input.ruleId, connection.organizationId, null)
    if (!rule) {
      throw new McpToolError('not_found', `Alert rule ${input.ruleId} not found.`)
    }

    return {
      connectionId: connection.id,
      rule: toMcpAlertRuleSummary(rule, await openEventCount(deps, connection, rule.id)),
    }
  }
}

export const listAlertRulesHandler = createListAlertRulesHandler()
export const getAlertRuleHandler = createGetAlertRuleHandler()
export const snoozeAlertRuleHandler = createSnoozeAlertRuleHandler()
export const unsnoozeAlertRuleHandler = createUnsnoozeAlertRuleHandler()
