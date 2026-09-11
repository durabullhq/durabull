#!/usr/bin/env bun
import '@durabull/env'

import {
  alertEventRepository,
  alertRuleRepository,
  getDb,
  mcpPolicyBinding,
  mcpServiceAccount,
  member,
  oauthAccessToken,
  oauthApplication,
  organization,
  redisConnectionRepository,
  redisDiscoveredQueueRepository,
  user,
} from '@durabull/dal'
import { MCP_PROTOCOL_VERSION } from '@durabull/mcp'
import { MCP_JSON_RPC_VERSION, parseSseJson } from '@durabull/mcp/testing'
import { QueueEvents, Worker } from 'bullmq'

import { toRedisConnectionOptions } from '../../apps/api/src/lib/connection-options'
import { getQueue } from '../../apps/api/src/lib/redis'

type Check = { name: string; ok: boolean; detail: string }
const checks: Check[] = []

function add(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail })
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} -> ${detail}`)
}

function parseJsonRpcText(text: string) {
  try {
    return parseSseJson(text) as Record<string, any>
  } catch {
    return {} as Record<string, any>
  }
}

async function mcpPost(
  baseUrl: string,
  body: Record<string, unknown>,
  options: { token: string; sessionId?: string }
) {
  const host = new URL(baseUrl).host
  const headers: Record<string, string> = {
    host,
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    authorization: `Bearer ${options.token}`,
  }
  if (options.sessionId) headers['mcp-session-id'] = options.sessionId

  return fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

async function initialize(baseUrl: string, token: string) {
  const res = await mcpPost(
    baseUrl,
    {
      jsonrpc: MCP_JSON_RPC_VERSION,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'final-live-proof', version: '1.0.0' },
      },
    },
    { token }
  )
  const body = parseJsonRpcText(await res.text())
  const sessionId = res.headers.get('mcp-session-id') ?? undefined
  return { res, body, sessionId }
}

async function callTool(
  baseUrl: string,
  token: string,
  sessionId: string,
  name: string,
  args: Record<string, unknown>
) {
  const res = await mcpPost(
    baseUrl,
    {
      jsonrpc: MCP_JSON_RPC_VERSION,
      id: 2,
      method: 'tools/call',
      params: { name, arguments: args },
    },
    { token, sessionId }
  )
  const raw = await res.text()
  return { res, body: parseJsonRpcText(raw), raw }
}

async function main() {
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3001'
  console.log(`Running live MCP proof against ${baseUrl}`)

  const db = await getDb()
  const now = new Date()
  const suffix = crypto.randomUUID().slice(0, 8)
  const orgId = `mcp-live-org-${suffix}`
  const userId = `mcp-live-user-${suffix}`
  const delegatedClientId = `mcp-live-delegated-client-${suffix}`
  const serviceClientId = `mcp-live-service-client-${suffix}`
  const deniedServiceClientId = `mcp-live-service-denied-client-${suffix}`
  const queueName = `mcp-live-queue-${suffix}`

  await db.insert(organization).values({
    id: orgId,
    name: `MCP Live Org ${suffix}`,
    slug: `mcp-live-org-${suffix}`,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(user).values({
    id: userId,
    email: `${userId}@example.com`,
    emailVerified: true,
    name: 'MCP Live User',
    image: null,
    lastSignInAt: null,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId,
    role: 'member',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(oauthApplication).values([
    {
      id: crypto.randomUUID(),
      name: 'mcp-live-delegated',
      clientId: delegatedClientId,
      redirectUrls: 'http://127.0.0.1:8765/callback',
      type: 'public',
      disabled: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: 'mcp-live-service',
      clientId: serviceClientId,
      redirectUrls: 'http://127.0.0.1:8765/callback',
      type: 'confidential',
      disabled: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: 'mcp-live-service-denied',
      clientId: deniedServiceClientId,
      redirectUrls: 'http://127.0.0.1:8765/callback',
      type: 'confidential',
      disabled: false,
      createdAt: now,
      updatedAt: now,
    },
  ])

  const [serviceAccount] = await db
    .insert(mcpServiceAccount)
    .values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      name: `mcp-live-service-${suffix}`,
      oauthClientId: serviceClientId,
      disabled: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  await db.insert(mcpServiceAccount).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    name: `mcp-live-service-denied-${suffix}`,
    oauthClientId: deniedServiceClientId,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(mcpPolicyBinding).values([
    {
      id: crypto.randomUUID(),
      principalType: 'service_account',
      principalId: serviceAccount.id,
      organizationId: orgId,
      toolName: null,
      scope: 'mcp:discover',
      disabled: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      principalType: 'service_account',
      principalId: serviceAccount.id,
      organizationId: orgId,
      toolName: null,
      scope: 'mcp:jobs:read',
      disabled: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      principalType: 'service_account',
      principalId: serviceAccount.id,
      organizationId: orgId,
      toolName: null,
      scope: 'mcp:logs:read',
      disabled: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      principalType: 'service_account',
      principalId: serviceAccount.id,
      organizationId: orgId,
      toolName: null,
      scope: 'mcp:failures:read',
      disabled: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      principalType: 'service_account',
      principalId: serviceAccount.id,
      organizationId: orgId,
      toolName: null,
      scope: 'mcp:diagnostics:read',
      disabled: false,
      createdAt: now,
      updatedAt: now,
    },
  ])

  const accessExp = new Date(Date.now() + 60 * 60 * 1000)
  const resource = `${new URL(baseUrl).origin}/mcp`
  const delegatedFullToken = `mcp-live-delegated-full-${suffix}`
  const delegatedLowScopeToken = `mcp-live-delegated-low-${suffix}`
  const serviceToken = `mcp-live-service-${suffix}`
  const deniedServiceToken = `mcp-live-service-denied-${suffix}`
  await db.insert(oauthAccessToken).values([
    {
      id: crypto.randomUUID(),
      accessToken: delegatedFullToken,
      refreshToken: `refresh-${delegatedFullToken}`,
      accessTokenExpiresAt: accessExp,
      refreshTokenExpiresAt: accessExp,
      clientId: delegatedClientId,
      userId,
      scopes: 'mcp:discover mcp:jobs:read mcp:logs:read mcp:failures:read mcp:diagnostics:read',
      resource,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      accessToken: delegatedLowScopeToken,
      refreshToken: `refresh-${delegatedLowScopeToken}`,
      accessTokenExpiresAt: accessExp,
      refreshTokenExpiresAt: accessExp,
      clientId: delegatedClientId,
      userId,
      scopes: 'mcp:discover',
      resource,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      accessToken: serviceToken,
      refreshToken: `refresh-${serviceToken}`,
      accessTokenExpiresAt: accessExp,
      refreshTokenExpiresAt: accessExp,
      clientId: serviceClientId,
      userId: null,
      scopes: 'mcp:discover mcp:jobs:read mcp:logs:read mcp:failures:read mcp:diagnostics:read',
      resource,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      accessToken: deniedServiceToken,
      refreshToken: `refresh-${deniedServiceToken}`,
      accessTokenExpiresAt: accessExp,
      refreshTokenExpiresAt: accessExp,
      clientId: deniedServiceClientId,
      userId: null,
      scopes: 'mcp:discover mcp:jobs:read mcp:logs:read',
      resource,
      createdAt: now,
      updatedAt: now,
    },
  ])

  const connection = await redisConnectionRepository.create({
    name: `mcp-live-conn-${suffix}`,
    url: 'redis://127.0.0.1:56379/9',
    isDefault: true,
    environment: 'development',
    prefix: 'bull',
    allowSelfSignedCerts: false,
    organizationId: orgId,
  })
  await redisDiscoveredQueueRepository.upsertConfirmedQueues(connection.id, [queueName], new Date())

  const redisOptions = toRedisConnectionOptions(connection.allowSelfSignedCerts)
  const queue = await getQueue(connection.id, connection.url, queueName, connection.prefix, redisOptions)
  const queueEvents = new QueueEvents(queueName, {
    connection: { url: connection.url },
    prefix: connection.prefix,
  })
  await queueEvents.waitUntilReady()
  const worker = new Worker(
    queueName,
    async (job) => {
      await job.log(`live-log-${suffix}-1`)
      await job.log(`live-log-${suffix}-2`)
      throw new Error(`live-failure-${suffix}`)
    },
    {
      connection: { url: connection.url },
      prefix: connection.prefix,
      concurrency: 1,
    }
  )
  await worker.waitUntilReady()

  const createdJob = await queue.add(
    `live-job-${suffix}`,
    { marker: `payload-${suffix}` },
    { removeOnComplete: false, removeOnFail: false, attempts: 1 }
  )
  try {
    await createdJob.waitUntilFinished(queueEvents, 15_000)
  } catch {
    // expected; worker throws to generate failed reason + stacktrace
  }
  const jobId = String(createdJob.id)
  add('Live queue/job setup', !!jobId, `connection=${connection.id}, queue=${queueName}, job=${jobId}`)

  const alertRule = await alertRuleRepository.create({
    organizationId: orgId,
    connectionId: connection.id,
    name: `mcp-live-rule-${suffix}`,
    type: 'job_failed',
    config: { notifyOnEveryFailure: true },
    enabled: true,
    notificationChannels: [],
    cooldownMinutes: 30,
    queueName,
    queueFilterMode: null,
    filterQueueNames: [],
  })
  const alertEvent = await alertEventRepository.create({
    alertRuleId: alertRule.id,
    organizationId: orgId,
    connectionId: connection.id,
    queueName,
    type: 'job_failed',
    status: 'firing',
    summary: `Live MCP failure for job ${jobId}`,
    context: { jobId, marker: `payload-${suffix}` },
    dedupeKey: `mcp-live-dedupe-${suffix}`,
    firedAt: now,
  })
  add(
    'Alert fixture seeded',
    alertEvent.id.length > 0,
    `rule=${alertRule.id}, event=${alertEvent.id}`
  )

  const delegatedInit = await initialize(baseUrl, delegatedFullToken)
  add(
    'Delegated initialize',
    delegatedInit.res.ok && !!delegatedInit.sessionId,
    `status=${delegatedInit.res.status}, session=${delegatedInit.sessionId ?? 'none'}`
  )
  if (!delegatedInit.sessionId) throw new Error('Delegated init failed')

  const serviceInit = await initialize(baseUrl, serviceToken)
  add(
    'Service initialize',
    serviceInit.res.ok && !!serviceInit.sessionId,
    `status=${serviceInit.res.status}, session=${serviceInit.sessionId ?? 'none'}`
  )
  if (!serviceInit.sessionId) throw new Error('Service init failed')

  const deniedServiceInit = await initialize(baseUrl, deniedServiceToken)
  add(
    'Denied-service initialize',
    deniedServiceInit.res.ok && !!deniedServiceInit.sessionId,
    `status=${deniedServiceInit.res.status}, session=${deniedServiceInit.sessionId ?? 'none'}`
  )
  if (!deniedServiceInit.sessionId) throw new Error('Denied service init failed')

  const lowScopeInit = await initialize(baseUrl, delegatedLowScopeToken)
  add(
    'Low-scope initialize',
    lowScopeInit.res.ok && !!lowScopeInit.sessionId,
    `status=${lowScopeInit.res.status}, session=${lowScopeInit.sessionId ?? 'none'}`
  )
  if (!lowScopeInit.sessionId) throw new Error('Low-scope init failed')

  const toolsList = await mcpPost(
    baseUrl,
    { jsonrpc: MCP_JSON_RPC_VERSION, id: 11, method: 'tools/list', params: {} },
    { token: delegatedFullToken, sessionId: delegatedInit.sessionId }
  )
  const toolsListBody = parseJsonRpcText(await toolsList.text())
  const toolNames: string[] = toolsListBody?.result?.tools?.map((t: any) => t.name) ?? []
  const expectedTools = [
    'ping',
    'list_connections',
    'list_queues',
    'get_queue',
    'get_connection_overview',
    'list_jobs',
    'find_job',
    'get_job',
    'get_job_logs',
    'get_job_stacktraces',
    'explain_job_failure',
    'list_scheduled_jobs',
    'get_scheduled_job',
    'get_workers',
    'get_queue_metrics',
    'get_redis_health',
    'get_failure_events',
    'get_alert_event',
    'get_alert_summary',
    'list_alert_rules',
    'get_alert_rule',
    'resolve_alert_event',
    'acknowledge_alert_event',
    'unacknowledge_alert_event',
    'snooze_alert_rule',
    'unsnooze_alert_rule',
    'retry_job',
    'promote_job',
    'pause_queue',
    'resume_queue',
  ]
  add(
    'tools/list exposes all MCP tools',
    toolsList.ok && expectedTools.every((name) => toolNames.includes(name)),
    `tools=${toolNames.join(',')}`
  )

  const ping = await callTool(baseUrl, delegatedFullToken, delegatedInit.sessionId, 'ping', {})
  add('ping', ping.res.ok && ping.body?.result?.content?.[0]?.text === 'pong', `status=${ping.res.status}`)

  const listConnections = await callTool(
    baseUrl,
    delegatedFullToken,
    delegatedInit.sessionId,
    'list_connections',
    { pageSize: 10 }
  )
  const listConnectionsJson = JSON.parse(
    listConnections.body?.result?.content?.[0]?.text ?? '{"connections":[]}'
  ) as { connections: Array<{ id: string }> }
  add(
    'list_connections',
    listConnections.res.ok &&
      listConnectionsJson.connections.some((connectionRow) => connectionRow.id === connection.id),
    `status=${listConnections.res.status}, total=${listConnectionsJson.connections.length}`
  )

  const listQueues = await callTool(
    baseUrl,
    delegatedFullToken,
    delegatedInit.sessionId,
    'list_queues',
    {
      connectionId: connection.id,
      pageSize: 10,
    }
  )
  const listQueuesJson = JSON.parse(
    listQueues.body?.result?.content?.[0]?.text ?? '{"queues":[]}'
  ) as { queues: Array<{ name: string }> }
  add(
    'list_queues',
    listQueues.res.ok && listQueuesJson.queues.some((row) => row.name === queueName),
    `status=${listQueues.res.status}, queues=${listQueuesJson.queues.map((q) => q.name).join(',')}`
  )

  const getQueueTool = await callTool(
    baseUrl,
    delegatedFullToken,
    delegatedInit.sessionId,
    'get_queue',
    { connectionId: connection.id, queueName }
  )
  const getQueueJson = JSON.parse(
    getQueueTool.body?.result?.content?.[0]?.text ?? '{"name":""}'
  ) as { name?: string }
  add('get_queue', getQueueTool.res.ok && getQueueJson.name === queueName, `status=${getQueueTool.res.status}`)

  const listJobs = await callTool(
    baseUrl,
    delegatedFullToken,
    delegatedInit.sessionId,
    'list_jobs',
    { connectionId: connection.id, queueName, pageSize: 20 }
  )
  const listJobsJson = JSON.parse(
    listJobs.body?.result?.content?.[0]?.text ?? '{"jobs":[]}'
  ) as { jobs: Array<{ id: string }> }
  add(
    'list_jobs',
    listJobs.res.ok && listJobsJson.jobs.some((row) => row.id === jobId),
    `status=${listJobs.res.status}, jobs=${listJobsJson.jobs.length}`
  )

  const getJob = await callTool(baseUrl, delegatedFullToken, delegatedInit.sessionId, 'get_job', {
    connectionId: connection.id,
    queueName,
    jobId,
  })
  const getJobJson = JSON.parse(getJob.body?.result?.content?.[0]?.text ?? '{"job":{}}') as {
    job?: { id?: string; status?: string; stacktraceCount?: number }
  }
  add(
    'get_job',
    getJob.res.ok && getJobJson.job?.id === jobId && (getJobJson.job?.stacktraceCount ?? 0) > 0,
    `status=${getJob.res.status}, state=${getJobJson.job?.status ?? 'unknown'}`
  )

  const getJobLogs = await callTool(
    baseUrl,
    delegatedFullToken,
    delegatedInit.sessionId,
    'get_job_logs',
    {
      connectionId: connection.id,
      queueName,
      jobId,
      pageSize: 10,
    }
  )
  const getJobLogsJson = JSON.parse(
    getJobLogs.body?.result?.content?.[0]?.text ?? '{"logs":[]}'
  ) as { logs: string[] }
  add(
    'get_job_logs',
    getJobLogs.res.ok && getJobLogsJson.logs.some((line) => line.includes(`live-log-${suffix}`)),
    `status=${getJobLogs.res.status}, logs=${getJobLogsJson.logs.length}`
  )

  const getStacktraces = await callTool(
    baseUrl,
    delegatedFullToken,
    delegatedInit.sessionId,
    'get_job_stacktraces',
    {
      connectionId: connection.id,
      queueName,
      jobId,
      pageSize: 10,
    }
  )
  const getStacktracesJson = JSON.parse(
    getStacktraces.body?.result?.content?.[0]?.text ?? '{"stacktraces":[]}'
  ) as { stacktraces: Array<{ stacktrace: string }> }
  add(
    'get_job_stacktraces',
    getStacktraces.res.ok &&
      getStacktracesJson.stacktraces.some((row) => row.stacktrace.includes(`live-failure-${suffix}`)),
    `status=${getStacktraces.res.status}, traces=${getStacktracesJson.stacktraces.length}`
  )

  const getFailureEvents = await callTool(
    baseUrl,
    delegatedFullToken,
    delegatedInit.sessionId,
    'get_failure_events',
    {
      connectionId: connection.id,
      queueName,
      jobId,
      pageSize: 10,
    }
  )
  const getFailureEventsJson = JSON.parse(
    getFailureEvents.body?.result?.content?.[0]?.text ?? '{"events":[]}'
  ) as { events: Array<{ id: string; summary: string; context: Record<string, unknown> | null }> }
  add(
    'get_failure_events',
    getFailureEvents.res.ok &&
      getFailureEventsJson.events.some((row) => row.id === alertEvent.id) &&
      getFailureEventsJson.events.some((row) => row.context?.jobId === jobId),
    `status=${getFailureEvents.res.status}, events=${getFailureEventsJson.events.length}`
  )

  const getQueueMetrics = await callTool(
    baseUrl,
    delegatedFullToken,
    delegatedInit.sessionId,
    'get_queue_metrics',
    {
      connectionId: connection.id,
      queueName,
      windowMinutes: 60,
    }
  )
  const getQueueMetricsJson = JSON.parse(
    getQueueMetrics.body?.result?.content?.[0]?.text ?? '{"queueName":""}'
  ) as {
    queueName?: string
    totals?: { failedInWindow?: number }
    counts?: { failed?: number }
    queue?: { workersCount?: number }
  }
  add(
    'get_queue_metrics',
    getQueueMetrics.res.ok &&
      getQueueMetricsJson.queueName === queueName &&
      typeof getQueueMetricsJson.totals?.failedInWindow === 'number' &&
      typeof getQueueMetricsJson.counts?.failed === 'number',
    `status=${getQueueMetrics.res.status}, failedInWindow=${getQueueMetricsJson.totals?.failedInWindow}, queueFailed=${getQueueMetricsJson.counts?.failed}`
  )

  const getWorkers = await callTool(
    baseUrl,
    delegatedFullToken,
    delegatedInit.sessionId,
    'get_workers',
    {
      connectionId: connection.id,
      queueName,
      pageSize: 10,
    }
  )
  const getWorkersJson = JSON.parse(
    getWorkers.body?.result?.content?.[0]?.text ?? '{"workers":[]}'
  ) as { workers: Array<{ queueName: string; id: string }>; queues: Array<{ name: string }> }
  add(
    'get_workers',
    getWorkers.res.ok &&
      getWorkersJson.workers.some((row) => row.queueName === queueName) &&
      getWorkersJson.queues.some((row) => row.name === queueName) &&
      (getWorkersJson.totalWorkersInPage ?? getWorkersJson.totalWorkers ?? 0) > 0,
    `status=${getWorkers.res.status}, workers=${getWorkersJson.workers.length}`
  )

  const explainJobFailure = await callTool(
    baseUrl,
    delegatedFullToken,
    delegatedInit.sessionId,
    'explain_job_failure',
    {
      connectionId: connection.id,
      queueName,
      jobId,
    }
  )
  const explainJobFailureJson = JSON.parse(
    explainJobFailure.body?.result?.content?.[0]?.text ?? '{"status":"unknown"}'
  ) as {
    status?: string
    confidence?: string
    summary?: string
    topSignal?: { excerpt?: string }
    relatedAlertEvents?: Array<{ id: string }>
  }
  add(
    'explain_job_failure',
    explainJobFailure.res.ok &&
      explainJobFailureJson.status === 'failed' &&
      (explainJobFailureJson.topSignal?.excerpt?.includes(`live-failure-${suffix}`) ?? false) &&
      (explainJobFailureJson.relatedAlertEvents?.some((row) => row.id === alertEvent.id) ?? false),
    `status=${explainJobFailure.res.status}, confidence=${explainJobFailureJson.confidence}, summaryLen=${explainJobFailureJson.summary?.length ?? 0}`
  )

  const serviceListConnections = await callTool(
    baseUrl,
    serviceToken,
    serviceInit.sessionId,
    'list_connections',
    { pageSize: 10 }
  )
  const serviceListConnectionsJson = JSON.parse(
    serviceListConnections.body?.result?.content?.[0]?.text ?? '{"connections":[]}'
  ) as { connections: Array<{ id: string }> }
  add(
    'service_account list_connections (allowed)',
    serviceListConnections.res.ok &&
      serviceListConnectionsJson.connections.some((connectionRow) => connectionRow.id === connection.id),
    `status=${serviceListConnections.res.status}`
  )

  const deniedServicePing = await callTool(
    baseUrl,
    deniedServiceToken,
    deniedServiceInit.sessionId,
    'ping',
    {}
  )
  add(
    'service_account without bindings denied',
    deniedServicePing.res.status === 403 &&
      (deniedServicePing.raw.includes('service_account_policy_denied') ||
        deniedServicePing.raw.includes('Forbidden')),
    `status=${deniedServicePing.res.status}`
  )

  const lowScopeListConnections = await callTool(
    baseUrl,
    delegatedLowScopeToken,
    lowScopeInit.sessionId,
    'list_connections',
    { pageSize: 10 }
  )
  add(
    'missing scope denied',
    lowScopeListConnections.res.status === 403 &&
      lowScopeListConnections.raw.includes('missing_scopes'),
    `status=${lowScopeListConnections.res.status}`
  )

  await worker.close()
  await queueEvents.close()
  await queue.close()

  const passCount = checks.filter((check) => check.ok).length
  console.log(`\nSummary: ${passCount}/${checks.length} checks passed`)
  if (passCount !== checks.length) {
    process.exit(1)
  }
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
