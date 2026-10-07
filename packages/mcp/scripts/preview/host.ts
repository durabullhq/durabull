import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import { getMcpToolDefinition } from '../../src/tools/tool-catalog'

const iframe = document.querySelector('iframe')!
const params = new URLSearchParams(location.search)
const counts = {
  waiting: 128,
  active: 12,
  delayed: 8,
  completed: 84592,
  failed: 7,
  paused: 0,
  prioritized: 3,
}
const connectionId = 'preview-production'
const job = {
  id: 'job-1042',
  name: 'send-receipt',
  status: 'failed',
  attemptsMade: 3,
  maxAttempts: 3,
  failedReason: 'Upstream email provider returned HTTP 503.',
  processedOn: 1791367000000,
  finishedOn: 1791367000300,
  timestamp: 1791366990000,
  delay: 0,
  priority: 0,
}
const calls: string[] = []
const messages: unknown[] = []
const fixture = (name: string, args: Record<string, unknown>) => {
  switch (name) {
    case 'list_connections':
      return {
        connections: [
          {
            id: connectionId,
            name: 'Production',
            environment: 'production',
            prefix: 'bull',
            isDefault: true,
            organizationId: 'preview',
          },
          {
            id: 'preview-staging',
            name: 'Staging',
            environment: 'staging',
            prefix: 'bull',
            isDefault: false,
            organizationId: 'preview',
          },
        ],
        nextCursor: null,
      }
    case 'get_connection_overview':
      return {
        connectionId,
        name: 'Production',
        environment: 'production',
        prefix: 'bull',
        discovery: { totalQueues: 3, confirmed: 3, pending: 0, lastDiscoveredAt: null },
        queues: {
          scanned: 3,
          truncated: false,
          totals: counts,
          paused: [],
          withoutWorkers: [],
          topFailed: [{ name: 'email:receipts', failed: 7 }],
          topBacklog: [
            { name: 'email:receipts', waiting: 128 },
            { name: 'image:resize', waiting: 26 },
          ],
        },
        workers: { total: 12 },
        alerts: { open: 2, firing: 2, acknowledged: 0 },
        redisHealth: null,
        warnings: [],
      }
    case 'list_queues':
      return {
        connectionId,
        total: 3,
        queues: (args.cursor
          ? ['<img src=x onerror=alert(1)>']
          : ['email:receipts', 'image:resize']
        ).map((name) => ({
          name,
          status: 'active',
          isPaused: false,
          discoveryState: 'confirmed',
          jobCounts: counts,
        })),
        nextCursor: args.cursor ? null : 'page-2',
      }
    case 'get_queue':
      return {
        connectionId,
        name: args.queueName,
        status: 'active',
        isPaused: false,
        scheduledJobsCount: 2,
        jobCounts: counts,
        workers: [
          { id: 'w1', name: 'worker-us-west', address: '10.0.0.1', ageMs: 8640000, idleMs: 250 },
        ],
      }
    case 'list_jobs':
      return { connectionId, queueName: args.queueName, total: 1, jobs: [job], nextCursor: null }
    case 'get_job':
      return {
        connectionId,
        queueName: args.queueName,
        job: {
          ...job,
          data: { orderId: 'ord-9281', apiKey: '[redacted]', subject: '<script>alert(1)</script>' },
          progress: 0,
          opts: {},
          returnvalue: null,
          stacktraceCount: 3,
        },
      }
    case 'get_job_logs':
      return {
        connectionId,
        queueName: args.queueName,
        jobId: job.id,
        logs: [
          'Preparing receipt for order ord-9281',
          'Provider request returned 503',
          'Retries exhausted',
        ],
        total: 3,
        nextCursor: null,
      }
    case 'get_job_stacktraces':
      return {
        connectionId,
        queueName: args.queueName,
        jobId: job.id,
        stacktraces: [
          {
            attemptNumber: 3,
            stacktrace: 'Error: upstream unavailable\n at sendReceipt (worker.ts:42)',
            isLatest: true,
          },
        ],
        total: 1,
        nextCursor: null,
      }
    case 'get_failure_events':
      return {
        connectionId,
        total: 1,
        events: [
          {
            id: 'evt-1',
            alertRuleId: 'rule-1',
            queueName: 'email:receipts',
            type: 'job_failed',
            status: 'firing',
            summary: 'Email delivery failing',
            context: null,
            firedAt: '2026-10-07T10:05:00Z',
            resolvedAt: null,
            acknowledgedAt: null,
          },
        ],
        nextCursor: null,
      }
    case 'get_alert_event':
      throw new Error('Preview: access denied for alert detail')
    case 'get_workers':
      return {
        connectionId,
        totalQueues: 3,
        totalWorkersInPage: 1,
        workers: [
          {
            id: 'w1',
            name: 'worker-us-west',
            address: '10.0.0.1',
            ageMs: 8640000,
            idleMs: 250,
            queueName: 'email:receipts',
          },
        ],
        queues: [],
        nextCursor: null,
      }
    default:
      throw new Error('No fixture for this view')
  }
}
const result = (name: string, args: Record<string, unknown>) => {
  const data = fixture(name, args)
  const definition = getMcpToolDefinition(name)!
  // The preview must obey the same schemas as the real server.
  definition.outputSchema!.parse(data)
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    structuredContent: data,
    _meta: { 'durabull/view': { toolName: name, arguments: args } },
  }
}
const bridge = new AppBridge(
  null,
  { name: 'Durabull preview host', version: '1.0.0' },
  { serverTools: {}, message: { text: {} }, updateModelContext: {}, openLinks: {} },
  {
    hostContext: {
      theme: params.get('theme') === 'dark' ? 'dark' : 'light',
      displayMode: 'inline',
      availableDisplayModes: ['inline', 'fullscreen'],
      toolInfo: { tool: { name: 'list_connections', inputSchema: { type: 'object' } } },
    },
  }
)
bridge.oncalltool = async ({ name, arguments: args }) => {
  calls.push(name)
  const definition = getMcpToolDefinition(name)
  if (!definition?.annotations.readOnlyHint)
    throw new Error('The UI must never invoke a mutation directly')
  await new Promise((resolve) => setTimeout(resolve, 120))
  return result(name, args ?? {})
}
bridge.onmessage = async (message) => {
  messages.push(message)
  return {}
}
bridge.onupdatemodelcontext = async () => ({})
bridge.onrequestdisplaymode = async ({ mode }) => {
  bridge.setHostContext({ displayMode: mode })
  return { mode }
}
bridge.onsizechange = ({ height }) => {
  if (height) iframe.style.height = `${height}px`
}
bridge.oninitialized = async () => {
  await bridge.sendToolInput({ arguments: {} })
  await bridge.sendToolResult(result('list_connections', {}))
}
Object.assign(window, { preview: { calls, messages, bridge } })
await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!))
iframe.src = '/app'
