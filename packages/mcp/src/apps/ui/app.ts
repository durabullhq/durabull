import type { CallToolResult } from '@modelcontextprotocol/client'
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps'
import { MCP_JOB_STATES } from '../../tools/tool-catalog'
import { healthSeries } from './health-series'
import { readErrorMessage } from './read-errors'
import { callReadTool, refreshToolCall } from './read-tools'

// The host is the only network boundary. No tokens, fetch(), remote fonts or localStorage.
const app = new App({ name: 'Durabull queue explorer', version: '1.1.0' }, {}, { autoResize: true })
type Data = Record<string, unknown>
type View = { tool: string; args: Data; data: Data; updatedAt: string }
const root = document.getElementById('app')!
let view: View | undefined
let initialArgs: Data = {}
let connected = false
let busy = false
let busyMessage = 'Loading the latest snapshot…'
let error = ''
let notice = ''
let search = ''
let requestId = 0
let activeRequest: AbortController | undefined
let failedRead: { tool: string; args: Data; remember: boolean } | undefined
const history: View[] = []
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
/** Normalize untrusted structured values before reading object fields. */
const obj = (value: unknown): Data =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Data) : {}
/** Normalize an optional collection into records for table rendering. */
const rows = (value: unknown): Data[] => (Array.isArray(value) ? value.map(obj) : [])
/** Accept only strings from host data; other values become an empty label. */
const str = (value: unknown) => (typeof value === 'string' ? value : '')
/** Exclude nonfinite and nonnumeric values from chart calculations. */
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
/** Format snapshot counts using the host locale and preserve missing values. */
const fmt = (value: unknown) => (value == null ? '—' : number.format(num(value)))
/** Convert protocol identifiers into sentence-case UI labels. */
const title = (value: string) => value.replaceAll('_', ' ').replace(/^./, (s) => s.toUpperCase())
const VIEW_TITLES: Record<string, string> = {
  list_connections: 'Connections',
  get_connection_overview: 'Connection health',
  list_queues: 'Queues',
  get_queue: 'Queue inspection',
  list_jobs: 'Jobs',
  find_job: 'Job search',
  get_job: 'Job inspection',
  get_job_logs: 'Job logs',
  get_job_stacktraces: 'Attempt stacktraces',
  explain_job_failure: 'Failure investigation',
  get_workers: 'Workers',
  list_scheduled_jobs: 'Recurring schedules',
  get_scheduled_job: 'Schedule inspection',
  get_failure_events: 'Alert activity',
  get_alert_event: 'Incident inspection',
  list_alert_rules: 'Alert rules',
  get_alert_rule: 'Rule inspection',
  get_alert_summary: 'Incidents',
  get_queue_metrics: 'Queue performance',
  get_redis_health: 'Redis health',
  retry_job: 'Retry requested',
  promote_job: 'Promotion requested',
  pause_queue: 'Queue paused',
  resume_queue: 'Queue resumed',
  acknowledge_alert_event: 'Alert acknowledged',
  unacknowledge_alert_event: 'Acknowledgement cleared',
  resolve_alert_event: 'Alert resolved',
  snooze_alert_rule: 'Rule snoozed',
  unsnooze_alert_rule: 'Snooze cleared',
}
const viewTitle = (tool: string) => VIEW_TITLES[tool] ?? title(tool)
/** Serialize values for text-only cells and expandable JSON details. */
const text = (value: unknown) =>
  value == null ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)

/** Create DOM nodes using textContent so tool data cannot become executable markup. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', value?: string) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (value !== undefined) node.textContent = value
  return node
}
/** Disable actions while disconnected or busy and dispatch the supplied callback. */
function button(label: string, action: () => void | Promise<void>, className = '') {
  const node = el('button', className, label)
  node.type = 'button'
  node.disabled = busy || !connected
  node.addEventListener('click', () => {
    void action()
  })
  return node
}
/** Render a textual status with a CSS state marker. */
function badge(value: unknown) {
  const node = el('span', 'badge', str(value) || 'Unknown')
  node.dataset.state = str(value)
  return node
}
/** Group content under a semantic section heading. */
function panel(label: string, body: HTMLElement) {
  const node = el('section', 'section')
  const head = el('div', 'section-head')
  head.append(el('h2', '', label))
  node.append(head, body)
  return node
}
/** Present labeled counts, optionally emphasizing warning or success values. */
function stats(values: [string, unknown, string?][]) {
  const node = el('div', 'stats')
  for (const [label, value, tone] of values) {
    const stat = el('div', 'stat')
    if (tone) stat.dataset.tone = tone
    stat.append(el('span', 'eyebrow', label), el('strong', '', fmt(value)))
    node.append(stat)
  }
  return node
}
/** Render accessible column headers and text-only data cells in a scroll container. */
function table(headers: string[], entries: unknown[][]) {
  if (!entries.length) return el('div', 'empty', 'Nothing to show on this page.')
  const wrapper = el('div', 'table-scroll')
  const node = el('table')
  const head = el('thead')
  const headerRow = el('tr')
  for (const label of headers) {
    const th = el('th', '', label)
    th.scope = 'col'
    headerRow.append(th)
  }
  head.append(headerRow)
  const body = el('tbody')
  for (const entry of entries) {
    const row = el('tr')
    for (const value of entry) {
      const cell = el('td')
      cell.append(value instanceof HTMLElement ? value : document.createTextNode(text(value)))
      row.append(cell)
    }
    body.append(row)
  }
  node.append(head, body)
  wrapper.append(node)
  return wrapper
}
/** Keep verbose structured data in a native, keyboard-accessible disclosure. */
function jsonDetails(label: string, value: unknown, open = false) {
  const node = el('details')
  node.open = open
  node.append(el('summary', '', label), el('pre', '', text(value)))
  return node
}
/** Present a consistent empty-state message inside the current view. */
function empty(message: string) {
  return el('div', 'empty', message)
}
/** Navigate through the read-only host bridge when a view action is selected. */
function toolButton(label: string, tool: string, args: Data, className = '') {
  return button(label, () => load(tool, args), className)
}
/** Carry the displayed connection identity into subsequent tool calls. */
function connectionArgs(): Data {
  return { connectionId: view?.data.connectionId ?? view?.args.connectionId }
}
/** Recover queue identity from either detail data or the originating request. */
function queueArgs(): Data {
  return {
    ...connectionArgs(),
    queueName: view?.data.queueName ?? view?.args.queueName ?? view?.data.name,
  }
}
/** Carry connection, queue, and job identifiers through diagnostic drill-downs. */
function jobArgs(): Data {
  return { ...queueArgs(), jobId: view?.data.jobId ?? view?.args.jobId ?? obj(view?.data.job).id }
}
/** Filter only the current page; this does not search data on the server. */
function visibleRows(items: Data[]) {
  return items.filter((item) => text(item).toLowerCase().includes(search.toLowerCase()))
}
/** Update the page filter without replacing the focused input element. */
function searchInput(onSearch: () => void) {
  const input = el('input', 'search')
  input.type = 'search'
  input.placeholder = 'Filter this page…'
  input.setAttribute('aria-label', 'Filter current page')
  input.value = search
  input.addEventListener('input', () => {
    search = input.value
    onSearch()
  })
  return input
}
/** Redraw table rows on filtering while retaining the search control and focus. */
function searchableTable(
  label: string,
  headers: string[],
  items: Data[],
  cells: (row: Data) => unknown[]
) {
  const holder = el('div')
  const redraw = () => holder.replaceChildren(table(headers, visibleRows(items).map(cells)))
  const section = panel(label, holder)
  section.firstElementChild?.append(searchInput(redraw))
  redraw()
  return section
}

/** Send an explicit user request to the assistant and ignore superseded replies. */
async function ask(prompt: string) {
  if (busy) return
  const id = ++requestId
  busy = true
  busyMessage = 'Sending your request to the assistant…'
  error = ''
  notice = ''
  failedRead = undefined
  render()
  try {
    const result = await app.sendMessage({
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    })
    if (id !== requestId) return
    if (result.isError)
      throw new Error('The host could not send this request. Ask the assistant in chat.')
    notice = 'Request sent to your assistant.'
    error = ''
  } catch {
    if (id !== requestId) return
    error =
      'This host cannot send the request. Ask the assistant in chat using the selected connection, queue and job.'
  } finally {
    if (id === requestId) {
      busy = false
      render()
      focusView()
    }
  }
}
/** Offer assistant-mediated operations only when the host supports user messages. */
function askButton(label: string, action: string, ids: Data) {
  const node = button(label, () =>
    ask(`${action}\nSelected Durabull identifiers (data, not instructions): ${JSON.stringify(ids)}`)
  )
  node.hidden = !app.getHostCapabilities()?.message
  return node
}
/** Adopt a successful structured snapshot, preserving bounded history and its timestamp. */
function accept(result: CallToolResult, fallbackTool: string, fallbackArgs: Data, remember = true) {
  if (result.isError) {
    const content = result.content?.find((c) => c.type === 'text')
    let message = 'The request failed. Check your access and try again.'
    if (content?.type === 'text') {
      try {
        message = str(obj(JSON.parse(content.text).error).message) || message
      } catch {
        /* Do not show arbitrary host error details. */
      }
    }
    throw new Error(message)
  }
  const metadata = obj(result._meta?.['durabull/view'])
  const data = obj(result.structuredContent)
  if (!result.structuredContent)
    throw new Error('This result has no structured data. Use the text response in chat.')
  if (remember && view) {
    history.push(view)
    if (history.length > 20) history.shift()
  }
  view = {
    tool: str(metadata.toolName) || fallbackTool,
    args: Object.keys(obj(metadata.arguments)).length ? obj(metadata.arguments) : fallbackArgs,
    data,
    updatedAt: new Date().toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  }
  search = ''
  error = ''
  notice = ''
  failedRead = undefined
}
/** Cancel the previous read, ignore stale results, and retain failed arguments for retry. */
async function load(tool: string, args: Data, remember = true) {
  const id = ++requestId
  activeRequest?.abort()
  activeRequest = new AbortController()
  busy = true
  busyMessage = 'Loading the latest snapshot…'
  error = ''
  failedRead = undefined
  render()
  try {
    const result = await callReadTool(
      app,
      { name: tool, arguments: args },
      { signal: activeRequest.signal, timeout: 30_000 }
    )
    if (id !== requestId) return
    accept(result, tool, args, remember)
    if (app.getHostCapabilities()?.updateModelContext) {
      void app
        .updateModelContext({
          structuredContent: { selectedTool: view?.tool, selectedArguments: view?.args },
        })
        .catch(() => {})
    }
  } catch (failure) {
    if (id !== requestId) return
    error = readErrorMessage(failure)
    failedRead = { tool, args, remember }
  } finally {
    if (id === requestId) {
      busy = false
      render()
      focusView()
    }
  }
}

/** Show connection choices that preserve their IDs when opening an overview. */
function renderConnections(data: Data) {
  const cards = el('div', 'cards')
  for (const connection of rows(data.connections)) {
    const card = toolButton(
      '',
      'get_connection_overview',
      { connectionId: connection.id },
      'connection'
    )
    card.append(
      el('span', 'arrow', '↗'),
      badge(connection.environment ?? 'Connection'),
      el('strong', '', str(connection.name)),
      el(
        'p',
        'subtle',
        connection.isDefault ? 'Default connection · Open overview' : 'Open connection overview'
      )
    )
    cards.append(card)
  }
  return cards.childElementCount
    ? cards
    : empty('No connections are available to this account. Check connection access in Durabull.')
}
/** Summarize queue health and link into backlog, failure, and worker views. */
function renderOverview(data: Data) {
  const body = el('div')
  const queues = obj(data.queues)
  const counts = obj(queues.totals)
  body.append(
    stats([
      ['Waiting', counts.waiting],
      ['Active', counts.active, 'accent'],
      ['Failed', counts.failed, 'danger'],
      ['Workers', obj(data.workers).total],
    ])
  )
  for (const warning of Array.isArray(data.warnings) ? data.warnings : [])
    body.append(el('p', 'notice', text(warning)))
  if (queues.truncated)
    body.append(
      el(
        'p',
        'notice',
        'This overview is a partial scan. Browse queues for the complete paginated list.'
      )
    )
  body.append(
    panel(
      'Queues needing attention',
      table(
        ['Queue', 'Failed', ''],
        rows(queues.topFailed).map((row) => [
          row.name,
          fmt(row.failed),
          toolButton(
            'Inspect →',
            'get_queue',
            { ...connectionArgs(), queueName: row.name },
            'link'
          ),
        ])
      )
    )
  )
  body.append(
    panel(
      'Largest backlog',
      table(
        ['Queue', 'Waiting', ''],
        rows(queues.topBacklog).map((row) => [
          row.name,
          fmt(row.waiting),
          toolButton(
            'Inspect →',
            'get_queue',
            { ...connectionArgs(), queueName: row.name },
            'link'
          ),
        ])
      )
    )
  )
  for (const [label, key] of [
    ['Waiting without workers', 'withoutWorkers'],
    ['Paused queues', 'paused'],
  ] as const) {
    const names = Array.isArray(queues[key]) ? (queues[key] as unknown[]) : []
    if (names.length)
      body.append(
        panel(
          label,
          table(
            ['Queue'],
            names.map((name) => [
              toolButton(str(name), 'get_queue', { ...connectionArgs(), queueName: name }, 'link'),
            ])
          )
        )
      )
  }
  body.append(
    panel(
      'Discovery coverage',
      facts([
        ['Queues scanned', queues.scanned],
        ['Discovered queues', obj(data.discovery).totalQueues],
        ['Pending discovery', obj(data.discovery).pending],
        ['Last discovered', obj(data.discovery).lastDiscoveredAt],
      ])
    )
  )
  return body
}
/** Show queue counts and diagnostics alongside assistant-mediated queue operations. */
function renderQueue(data: Data) {
  const body = el('div')
  const counts = obj(data.jobCounts)
  body.append(
    stats([
      ['Waiting', counts.waiting],
      ['Active', counts.active, 'accent'],
      ['Failed', counts.failed, 'danger'],
      ['Completed', counts.completed],
    ])
  )
  const actions = el('div', 'actions details')
  actions.append(
    toolButton('Browse jobs', 'list_jobs', queueArgs(), 'primary'),
    toolButton('Failed jobs', 'list_jobs', { ...queueArgs(), status: 'failed' }),
    toolButton('Metrics', 'get_queue_metrics', queueArgs()),
    toolButton('Schedules', 'list_scheduled_jobs', queueArgs()),
    askButton(
      data.isPaused ? 'Ask to resume' : 'Ask to pause',
      data.isPaused ? 'Resume this queue.' : 'Pause this queue.',
      queueArgs()
    )
  )
  body.append(panel('Queue operations', actions))
  body.append(
    panel(
      'Workers',
      table(
        ['Name', 'Age (ms)', 'Idle (ms)'],
        rows(data.workers).map((row) => [row.name || row.id, fmt(row.ageMs), fmt(row.idleMs)])
      )
    )
  )
  return body
}
/** Show job diagnostics and request recovery through the assistant message channel. */
function renderJob(data: Data) {
  const job = obj(data.job)
  const body = el('div')
  const info = el('dl', 'detail-grid details')
  for (const [label, value] of [
    ['Status', job.status],
    ['Attempts', `${fmt(job.attemptsMade)} / ${fmt(job.maxAttempts)}`],
    ['Priority', job.priority],
    ['Job ID', job.id],
  ]) {
    const group = el('div')
    group.append(el('dt', '', text(label)), el('dd', '', text(value)))
    info.append(group)
  }
  body.append(panel(str(job.name) || 'Job details', info))
  if (job.failedReason) body.append(el('p', 'notice error', str(job.failedReason)))
  const actions = el('div', 'actions')
  actions.append(
    toolButton('Logs', 'get_job_logs', jobArgs()),
    toolButton('Stacktraces', 'get_job_stacktraces', jobArgs()),
    toolButton('Failure evidence', 'explain_job_failure', jobArgs()),
    askButton(
      'Ask to investigate',
      'Investigate this job failure. Gather evidence before proposing changes.',
      jobArgs()
    )
  )
  if (job.status === 'failed')
    actions.append(askButton('Ask to retry', 'Retry this failed job once.', jobArgs()))
  if (job.status === 'delayed')
    actions.append(askButton('Ask to promote', 'Promote this delayed job to run now.', jobArgs()))
  body.append(
    actions,
    jsonDetails('Job payload · redacted', job.data, true),
    jsonDetails('Result & progress', { result: job.returnvalue, progress: job.progress })
  )
  return body
}
/** Render bounded metric samples with a textual table and collection-health notices. */
function renderMetrics(data: Data) {
  const body = el('div')
  if (data.totals) {
    const totals = obj(data.totals)
    body.append(
      stats([
        ['Completed', totals.completedInWindow, 'accent'],
        ['Failed', totals.failedInWindow, 'danger'],
        ['Jobs / minute', totals.avgCompletedPerMinuteInWindow],
        ['Drain (minutes)', totals.estimatedDrainMinutes],
      ])
    )
    for (const warning of Array.isArray(data.warnings) ? data.warnings : [])
      body.append(el('p', 'notice', text(warning)))
    body.append(
      panel(
        'Window & coverage',
        facts([
          ['Requested minutes', obj(data.range).requestedWindowMinutes],
          ['Returned points', obj(data.range).returnedPoints],
          ['Window coverage', obj(data.range).requestedWindowCoverage],
          ['Latest point age (ms)', obj(data.range).latestPointAgeMs],
        ])
      ),
      panel(
        'Processing capacity',
        facts([
          ['Paused', obj(data.queue).isPaused],
          ['At capacity', obj(data.queue).isMaxed],
          ['Waiting to process', obj(data.queue).waitingToProcess],
          ['Workers', obj(data.queue).workersCount],
          ['Success rate (%)', totals.successRateInWindow],
          ['Failure rate (%)', totals.failureRateInWindow],
          ['Longest failure streak (minutes)', totals.longestFailureStreakMinutesInWindow],
          ['Schedulers', obj(data.queue).schedulersCount],
        ])
      ),
      el(
        'p',
        'notice',
        'Drain time estimates use the observed completion rate. Incoming work and changes in capacity can alter the result.'
      )
    )
    return body
  }
  if (obj(data.latest).isStale)
    body.append(
      el('p', 'notice', 'The latest Redis sample is stale. Check collection health in Durabull.')
    )
  if (data.collectionEnabled === false)
    body.append(el('p', 'notice', 'Redis health collection is disabled for this connection.'))
  const latest = obj(data.latest)
  body.append(
    stats([
      ['Memory (%)', latest.memoryUsagePercent],
      ['CPU (%)', latest.cpuUsagePercent],
      ['Connected clients', latest.connectedClients],
      ['Evictions / minute', latest.evictedKeysPerMinute, 'danger'],
    ]),
    panel(
      'Collection & coverage',
      facts([
        ['Latest sample', latest.capturedAt],
        ['Coverage (%)', obj(data.range).coveragePercent],
        ['From', obj(data.range).from],
        ['To', obj(data.range).to],
        ['Bucket (minutes)', obj(data.range).bucketMinutes],
        ['Aggregation', 'Maximum per bucket'],
      ])
    ),
    panel(
      'Redis capacity',
      facts([
        ['Used memory (bytes)', latest.usedMemoryBytes],
        ['Resident memory (bytes)', latest.residentMemoryBytes],
        ['Capacity (bytes)', latest.memoryCapacityBytes],
        ['Capacity source', latest.memoryCapacitySource],
        ['Fragmentation ratio', latest.memoryFragmentationRatio],
        ['Fragmentation (bytes)', latest.memoryFragmentationBytes],
        ['Max clients', latest.maxClients],
        ['Client utilization (%)', latest.connectedClientsPercent],
        ['Blocked clients', latest.blockedClients],
        ['Rejected connections / minute', latest.rejectedConnectionsPerMinute],
      ])
    ),
    el(
      'p',
      'notice',
      'BullMQ workers use blocking Redis connections. Blocked clients alone do not indicate an incident.'
    ),
    panel(
      'Configured thresholds',
      table(
        ['Rule', 'Metric', 'Threshold'],
        rows(data.thresholds).map((rule) => [
          toolButton(
            str(rule.name),
            'get_alert_rule',
            { ...connectionArgs(), ruleId: rule.ruleId },
            'link'
          ),
          title(str(rule.metric)),
          fmt(rule.threshold),
        ])
      )
    )
  )
  const history = healthSeries(data.series)
  const coverage = `${history.measured} of ${history.total} returned time buckets have memory measurements.`
  body.append(el('p', 'legend', coverage))
  if (!history.measured) {
    body.append(empty('No memory measurements for this time window.'))
    return body
  }
  const samples = history.points
  const chart = el('div', 'chart')
  chart.setAttribute('role', 'img')
  chart.setAttribute(
    'aria-label',
    `Memory usage: ${history.displayedMeasured} of ${samples.length} displayed buckets measured. Missing measurements are gaps. Values are in the table below.`
  )
  for (const sample of samples) {
    const value = sample.memoryUsagePercent
    const bar = el('div', value === null ? 'bar missing' : 'bar')
    if (value !== null)
      bar.style.setProperty('--height', `${(Math.max(0, value) / history.max) * 100}%`)
    bar.title = `${sample.capturedAt}: ${value === null ? 'No memory measurement' : `${fmt(value)}%`}`
    chart.append(bar)
  }
  body.append(
    panel('Memory usage (%)', chart),
    el(
      'p',
      'legend',
      `Last ${samples.length} time buckets · Gaps indicate unavailable memory measurements.`
    ),
    panel(
      'Memory measurements',
      table(
        ['Captured at', 'Memory usage (%)', 'Samples in bucket'],
        samples
          .slice(-20)
          .map((sample) => [sample.capturedAt, fmt(sample.memoryUsagePercent), sample.sampleCount])
      )
    )
  )
  return body
}
/** Present structured facts without exposing protocol-shaped JSON as the main interface. */
function facts(values: [string, unknown][]) {
  const list = el('dl', 'detail-grid details')
  for (const [label, value] of values) {
    const item = el('div')
    item.append(el('dt', '', label), el('dd', '', text(value)))
    list.append(item)
  }
  return list
}

/** Search an exact job ID across this connection, independently of page filtering. */
function jobSearch() {
  const group = el('div', 'actions job-search')
  group.setAttribute('role', 'search')
  const input = el('input', 'search')
  input.name = 'jobId'
  input.placeholder = 'Exact job ID…'
  input.setAttribute('aria-label', 'Find job by exact ID across queues')
  input.disabled = busy || !connected
  const find = () => {
    if (!input.value.trim() || busy) return
    void load('find_job', { ...connectionArgs(), jobId: input.value.trim() })
  }
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      find()
    }
  })
  group.append(input, button('Find job', find))
  return group
}

function renderSchedule(data: Data) {
  const schedule = obj(data.scheduledJob)
  const body = el('div')
  body.append(
    panel(
      str(schedule.jobName) || 'Recurring job',
      facts([
        ['Scheduler ID', schedule.schedulerId],
        ['Queue', schedule.queueName],
        ['Cron pattern', schedule.pattern],
        ['Interval (ms)', schedule.everyMs],
        ['Timezone', schedule.timezone ?? 'Unspecified'],
        ['Next run', schedule.nextRunAt],
        ['Starts', schedule.startDate],
        ['Ends', schedule.endDate],
        ['Iterations', schedule.iterationCount],
        ['Run limit', schedule.limit],
        ['Recent failures', schedule.recentFailedCount],
        ['Last failure', schedule.lastFailedAt],
      ])
    ),
    el(
      'p',
      'notice',
      'Next run is a scheduled time, not proof of execution. Workers and queue state determine processing.'
    ),
    toolButton('Inspect queue', 'get_queue', {
      ...connectionArgs(),
      queueName: schedule.queueName,
    }),
    jsonDetails('Job template · redacted', schedule.data),
    jsonDetails('Template options', schedule.templateOptions)
  )
  return body
}

function renderAlert(data: Data) {
  const event = obj(data.event)
  const body = el('div')
  body.append(
    panel(
      str(event.summary) || 'Alert detail',
      facts([
        ['Status', event.status],
        ['Queue', event.queueName],
        ['Type', title(str(event.type))],
        ['Fired', event.firedAt],
        ['Acknowledged', event.acknowledgedAt ?? 'Not acknowledged'],
        ['Resolved', event.resolvedAt],
        ['Notification sent', event.notificationSentAt],
      ])
    )
  )
  const actions = el('div', 'actions details')
  actions.append(
    toolButton('Inspect rule', 'get_alert_rule', { ...connectionArgs(), ruleId: event.alertRuleId })
  )
  if (event.status === 'firing') {
    const ids = { ...connectionArgs(), eventId: event.id }
    actions.append(
      askButton(
        event.acknowledgedAt ? 'Ask to unacknowledge' : 'Ask to acknowledge',
        event.acknowledgedAt
          ? 'Unacknowledge this firing alert.'
          : 'Acknowledge this firing alert.',
        ids
      ),
      askButton(
        'Ask to resolve',
        'Resolve this firing alert. Linked external issues may close asynchronously.',
        ids
      )
    )
  }
  body.append(
    actions,
    panel(
      'Notification delivery',
      Array.isArray(event.deliveries)
        ? table(
            ['Channel', 'Status', 'Attempts', 'Last error', 'Next retry'],
            rows(event.deliveries).map((delivery) => [
              delivery.channelType,
              badge(delivery.status),
              fmt(delivery.attemptCount),
              delivery.lastError,
              delivery.nextRetryAt,
            ])
          )
        : toolButton('Inspect delivery status', 'get_alert_event', {
            ...connectionArgs(),
            eventId: event.id,
          })
    ),
    jsonDetails('Alert context · redacted', event.context)
  )
  return body
}

function renderRule(data: Data) {
  const rule = obj(data.rule)
  const body = el('div')
  body.append(
    panel(
      str(rule.name) || 'Alert rule',
      facts([
        ['State', rule.state],
        ['Type', title(str(rule.type))],
        ['Queue', rule.queueName ?? 'Multiple queues'],
        ['Cooldown (minutes)', rule.cooldownMinutes],
        ['Snoozed until', rule.mutedUntil],
        ['Open events', rule.openEventCount],
        ['Queue filter', rule.queueFilterMode],
        [
          'Filtered queues',
          Array.isArray(rule.filterQueueNames) ? rule.filterQueueNames.join(', ') : null,
        ],
      ])
    )
  )
  const ids = { ...connectionArgs(), ruleId: rule.id }
  const actions = el('div', 'actions details')
  if (rule.state === 'snoozed')
    actions.append(askButton('Ask to unsnooze', 'Unsnooze this alert rule.', ids))
  else if (rule.enabled)
    actions.append(
      askButton('Ask to snooze for 1 hour', 'Snooze this alert rule for 60 minutes.', ids)
    )
  body.append(
    actions,
    panel(
      'Recent events',
      table(
        ['Alert', 'State', 'Fired'],
        rows(data.recentEvents).map((event) => [
          toolButton(
            str(event.summary) || str(event.id),
            'get_alert_event',
            { ...connectionArgs(), eventId: event.id },
            'link'
          ),
          badge(event.status),
          event.firedAt,
        ])
      )
    ),
    jsonDetails('Rule configuration', rule.config),
    jsonDetails('Notification channels · redacted', rule.notificationChannels)
  )
  return body
}

function renderAlertSummary(data: Data) {
  const body = el('div')
  body.append(
    stats([
      ['Open', data.open, 'danger'],
      ['Unacknowledged', data.firing],
      ['Acknowledged', data.acknowledged],
      ['Rules', obj(data.rules).total],
    ])
  )
  if (data.truncated)
    body.append(
      el('p', 'notice', 'More than 500 open events. These breakdowns cover a partial sample.')
    )
  body.append(
    panel(
      'Open incidents by queue',
      table(
        ['Queue', 'Open'],
        rows(data.byQueue).map((row) => [
          toolButton(
            str(row.queueName) || 'Connection-wide',
            'get_failure_events',
            {
              ...connectionArgs(),
              ...(row.queueName ? { queueName: row.queueName } : {}),
              status: 'firing',
            },
            'link'
          ),
          fmt(row.open),
        ])
      )
    ),
    panel(
      'Open incidents by rule',
      table(
        ['Rule', 'Open'],
        rows(data.byRule).map((row) => [
          toolButton(
            str(row.ruleName) || str(row.alertRuleId),
            'get_alert_rule',
            { ...connectionArgs(), ruleId: row.alertRuleId },
            'link'
          ),
          fmt(row.open),
        ])
      )
    ),
    panel(
      'Rule coverage',
      facts([
        ['Active', obj(data.rules).active],
        ['Snoozed', obj(data.rules).snoozed],
        ['Disabled', obj(data.rules).disabled],
      ])
    )
  )
  return body
}

/** Show an operation receipt and offer a read of the current state, never a replay. */
function renderOperation(current: View) {
  const body = el('div')
  const read = refreshToolCall(current.tool, current.args)
  body.append(
    panel(
      'Operation result',
      facts([
        ['Operation', title(current.tool)],
        ['Connection', current.data.connectionId],
        ...('jobId' in current.data
          ? ([
              ['Queue', current.data.queueName],
              ['Job ID', current.data.jobId],
              ['Previous state', current.data.previousState],
              ['Observed state', current.data.state],
            ] as [string, unknown][])
          : ([
              ['Queue', current.data.queueName],
              ['Paused', current.data.isPaused],
              ['Changed', current.data.changed],
            ] as [string, unknown][])),
      ])
    )
  )
  if ('jobId' in current.data)
    body.append(
      el(
        'p',
        'notice',
        'Queued work is not proof of successful completion. Inspect the job for its current state.'
      )
    )
  if (read)
    body.append(toolButton('Inspect current state', read.name, read.arguments ?? {}, 'primary'))
  return body
}

/** Select a view by tool name, falling back to expandable structured data. */
function renderContent(current: View) {
  const { tool, data } = current
  switch (tool) {
    case 'list_connections':
      return renderConnections(data)
    case 'get_connection_overview':
      return renderOverview(data)
    case 'list_queues':
      return searchableTable(
        'Queues',
        ['Queue', 'State', 'Waiting', 'Active', 'Failed'],
        rows(data.queues),
        (row) => [
          toolButton(
            str(row.name),
            'get_queue',
            { ...connectionArgs(), queueName: row.name },
            'link'
          ),
          badge(row.status),
          fmt(obj(row.jobCounts).waiting),
          fmt(obj(row.jobCounts).active),
          fmt(obj(row.jobCounts).failed),
        ]
      )
    case 'get_queue':
      return renderQueue(data)
    case 'list_jobs': {
      const body = el('div')
      const filters = el('div', 'actions details')
      const label = el('label', '', 'Job state')
      const select = el('select')
      select.setAttribute('aria-label', 'Job state')
      select.disabled = busy || !connected
      for (const state of ['', ...MCP_JOB_STATES]) {
        const option = el('option', '', state ? title(state) : 'All states')
        option.value = state
        option.selected = state === (current.args.status ?? '')
        select.append(option)
      }
      select.addEventListener('change', () => {
        const { cursor: _cursor, status: _status, ...args } = current.args
        void load('list_jobs', { ...args, ...(select.value ? { status: select.value } : {}) })
      })
      label.append(select)
      filters.append(label, el('span', 'subtle', `${fmt(data.total)} jobs match this query`))
      body.append(
        filters,
        searchableTable('Jobs', ['Job', 'State', 'Attempts', 'Failure'], rows(data.jobs), (row) => [
          toolButton(str(row.id), 'get_job', { ...queueArgs(), jobId: row.id }, 'link'),
          badge(row.status),
          `${fmt(row.attemptsMade)} / ${fmt(row.maxAttempts)}`,
          str(row.failedReason) || '—',
        ])
      )
      return body
    }
    case 'find_job': {
      const body = el('div')
      body.append(
        el(
          'p',
          'notice',
          `Scanned ${fmt(data.queuesScanned)} of ${fmt(data.totalQueues)} queues. ${data.truncated ? 'Partial search: narrow the queue to check remaining jobs.' : 'Job IDs may occur in multiple queues.'}`
        )
      )
      body.append(
        searchableTable(
          'Matching jobs',
          ['Queue', 'Job', 'State', 'Name'],
          rows(data.matches),
          (match) => [
            match.queueName,
            toolButton(
              str(obj(match.job).id),
              'get_job',
              { ...connectionArgs(), queueName: match.queueName, jobId: obj(match.job).id },
              'link'
            ),
            badge(obj(match.job).status),
            obj(match.job).name,
          ]
        )
      )
      return body
    }
    case 'get_job':
      return renderJob(data)
    case 'get_scheduled_job':
      return renderSchedule(data)
    case 'get_alert_event':
    case 'resolve_alert_event':
    case 'acknowledge_alert_event':
    case 'unacknowledge_alert_event':
      return renderAlert(data)
    case 'get_alert_rule':
    case 'snooze_alert_rule':
    case 'unsnooze_alert_rule':
      return renderRule(data)
    case 'list_alert_rules':
      return searchableTable(
        'Alert rules',
        ['Rule', 'Type', 'State', 'Open', 'Snoozed until'],
        rows(data.rules),
        (rule) => [
          toolButton(
            str(rule.name),
            'get_alert_rule',
            { ...connectionArgs(), ruleId: rule.id },
            'link'
          ),
          title(str(rule.type)),
          badge(rule.state),
          fmt(rule.openEventCount),
          rule.mutedUntil,
        ]
      )
    case 'retry_job':
    case 'promote_job':
    case 'pause_queue':
    case 'resume_queue':
      return renderOperation(current)
    case 'get_job_logs':
      return panel(
        'Job logs · redacted',
        el(
          'pre',
          '',
          Array.isArray(data.logs) && data.logs.length
            ? data.logs.join('\n')
            : 'No logs for this job.'
        )
      )
    case 'get_job_stacktraces':
      return panel(
        'Stacktraces · redacted',
        el(
          'pre',
          '',
          rows(data.stacktraces)
            .map((row) => `Attempt ${row.attemptNumber}\n${row.stacktrace}`)
            .join('\n\n') || 'No stacktraces for this job.'
        )
      )
    case 'get_failure_events':
      return searchableTable(
        'Alert activity',
        ['Alert', 'Queue', 'State', 'Fired'],
        rows(data.events),
        (row) => [
          toolButton(
            str(row.summary) || str(row.id),
            'get_alert_event',
            { ...connectionArgs(), eventId: row.id },
            'link'
          ),
          row.queueName,
          badge(row.status),
          row.firedAt,
        ]
      )
    case 'list_scheduled_jobs':
      return searchableTable(
        'Scheduled jobs',
        ['Job', 'Queue', 'Schedule', 'Next run'],
        rows(data.scheduledJobs),
        (row) => [
          toolButton(
            str(row.jobName),
            'get_scheduled_job',
            { ...connectionArgs(), queueName: row.queueName, schedulerId: row.schedulerId },
            'link'
          ),
          row.queueName,
          row.pattern ?? `${fmt(row.everyMs)} ms`,
          row.nextRunAt,
        ]
      )
    case 'get_workers':
      return searchableTable(
        'Workers',
        ['Name', 'Queue', 'Age (ms)', 'Idle (ms)'],
        rows(data.workers),
        (row) => [row.name || row.id, row.queueName, fmt(row.ageMs), fmt(row.idleMs)]
      )
    case 'get_queue_metrics':
    case 'get_redis_health':
      return renderMetrics(data)
    case 'explain_job_failure': {
      const body = el('div')
      const details = el('div', 'details')
      details.append(
        el('p', '', str(data.summary)),
        el('p', 'subtle', `Evidence confidence: ${str(data.confidence)}`)
      )
      body.append(
        panel('Failure evidence', details),
        panel(
          'Attempt timeline',
          facts([
            ['State', data.status],
            ['Attempts made', obj(data.attemptTimeline).attemptsMade],
            ['Max attempts', obj(data.attemptTimeline).maxAttempts],
            ['Signal source', title(str(obj(data.topSignal).source))],
          ])
        ),
        panel('Strongest signal', el('pre', '', str(obj(data.topSignal).excerpt))),
        panel(
          'Recent logs · redacted',
          el(
            'pre',
            '',
            Array.isArray(data.recentLogLines)
              ? data.recentLogLines.join('\n')
              : 'No logs available.'
          )
        ),
        panel(
          'Evidence gaps',
          table(
            ['Source', 'Reason'],
            rows(data.skippedSources).map((source) => [source.source, source.reason])
          )
        )
      )
      return body
    }
    case 'get_alert_summary':
      return renderAlertSummary(data)
    default:
      return jsonDetails(title(tool), data, true)
  }
}

/** Move keyboard focus to the latest status, error, or view heading after navigation. */
function focusView() {
  const target = root.querySelector<HTMLElement>('[role="alert"], [role="status"], h1')
  if (target) {
    target.tabIndex = -1
    target.focus({ preventScroll: true })
  }
}

/** Rebuild the shell from the current snapshot, request state, and host capabilities. */
function render() {
  const shell = el('div', 'app')
  const masthead = el('header', 'masthead')
  const brand = el('div', 'brand')
  brand.append(
    el('span', 'mark', 'd.'),
    document.createTextNode('DURABULL'),
    el('span', 'subtle', '/ QUEUE EXPLORER')
  )
  const actions = el('div', 'actions')
  if (app.getHostContext()?.availableDisplayModes?.includes('fullscreen'))
    actions.append(
      button(
        app.getHostContext()?.displayMode === 'fullscreen' ? 'Collapse' : 'Expand',
        async () => {
          try {
            await app.requestDisplayMode({
              mode: app.getHostContext()?.displayMode === 'fullscreen' ? 'inline' : 'fullscreen',
            })
          } catch {
            error = 'This host could not change display mode.'
            render()
          }
        }
      )
    )
  const refresh = view
    ? refreshToolCall(view.tool, view.args)
    : { name: 'list_connections', arguments: {} }
  if (refresh)
    actions.append(button('Refresh', () => load(refresh.name, refresh.arguments ?? {}, false)))
  masthead.append(brand, actions)
  shell.append(masthead)
  const crumbs = el('nav', 'breadcrumb')
  crumbs.setAttribute('aria-label', 'Explorer navigation')
  if (history.length)
    crumbs.append(
      button('← Back', () => {
        view = history.pop()
        search = ''
        error = ''
        failedRead = undefined
        render()
        focusView()
      })
    )
  if (view?.tool !== 'list_connections')
    crumbs.append(toolButton('Connections', 'list_connections', {}))
  if (view?.data.connectionId)
    crumbs.append(toolButton('Connection overview', 'get_connection_overview', connectionArgs()))
  shell.append(crumbs)
  const hero = el('div', 'hero')
  const heading = el('div')
  const name = view
    ? view.tool === 'list_connections'
      ? 'Your queues, in focus.'
      : str(view.data.queueName) ||
        (['get_queue', 'get_connection_overview'].includes(view.tool) ? str(view.data.name) : '') ||
        viewTitle(view.tool)
    : 'Your queues, in focus.'
  heading.append(
    el('p', 'eyebrow', view ? viewTitle(view.tool) : 'Operations workspace'),
    el('h1', '', name),
    el(
      'p',
      'subtle',
      view?.tool === 'list_connections'
        ? 'Choose a connection to inspect its queues, workers and alerts.'
        : 'Live snapshots from your connected Durabull workspace.'
    )
  )
  hero.append(heading)
  shell.append(hero)
  if (view?.data.connectionId) {
    const tabs = el('nav', 'tabs')
    tabs.setAttribute('aria-label', 'Connection views')
    for (const [label, tool] of [
      ['Queues', 'list_queues'],
      ['Workers', 'get_workers'],
      ['Schedules', 'list_scheduled_jobs'],
      ['Incidents', 'get_alert_summary'],
      ['Alerts', 'get_failure_events'],
      ['Rules', 'list_alert_rules'],
      ['Redis health', 'get_redis_health'],
    ]) {
      const tab = toolButton(label, tool, connectionArgs())
      if (tool === view.tool) tab.setAttribute('aria-current', 'page')
      tabs.append(tab)
    }
    shell.append(tabs, jobSearch())
  }
  if (error) {
    const node = el('div', 'notice error', error)
    node.setAttribute('role', 'alert')
    const retry = failedRead
    if (retry)
      node.append(button('Retry request', () => load(retry.tool, retry.args, retry.remember)))
    shell.append(node)
  }
  if (notice) {
    const node = el('div', 'notice', notice)
    node.setAttribute('role', 'status')
    shell.append(node)
  }
  if (busy) {
    const node = el('div', 'notice')
    node.setAttribute('role', 'status')
    node.append(el('span', 'spinner'), document.createTextNode(busyMessage))
    shell.append(node)
  }
  if (view) {
    const content = renderContent(view)
    content.classList.toggle('loading', busy)
    content.setAttribute('aria-busy', String(busy))
    shell.append(content)
    if (view.data.nextCursor) {
      const pagination = el('div', 'actions')
      pagination.append(
        toolButton('Next page →', view.tool, { ...view.args, cursor: view.data.nextCursor })
      )
      shell.append(pagination)
    }
    const safety = obj(view.data._mcpSafety)
    if (num(safety.redactionCount))
      shell.append(
        el('p', 'subtle', `${fmt(safety.redactionCount)} sensitive values were redacted.`)
      )
    shell.append(jsonDetails('Structured response', view.data))
  } else if (!error)
    shell.append(
      empty(
        connected
          ? 'Waiting for the initial result. Use Refresh if the host opened this view without data.'
          : 'Connecting to the host…'
      )
    )
  const footer = el('footer', 'footer')
  footer.append(
    el('span', '', 'Scoped access · Sensitive values redacted'),
    el('span', '', view ? `Updated ${view.updatedAt}` : 'Durabull MCP App')
  )
  shell.append(footer)
  root.replaceChildren(shell)
}
/** Apply host theme, style variables, and safe areas before redrawing the view. */
function applyContext(context: ReturnType<App['getHostContext']>) {
  if (context?.theme) applyDocumentTheme(context.theme)
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables)
  if (context?.safeAreaInsets) {
    const { top, right, bottom, left } = context.safeAreaInsets
    document.body.style.padding = `${Math.max(10, top)}px ${Math.max(10, right)}px ${Math.max(10, bottom)}px ${Math.max(10, left)}px`
  }
  render()
}
app.ontoolinput = ({ arguments: args }) => {
  initialArgs = args ?? {}
}
app.ontoolresult = (result) => {
  ++requestId
  activeRequest?.abort()
  busy = false
  failedRead = undefined
  try {
    accept(
      result,
      app.getHostContext()?.toolInfo?.tool.name ?? 'list_connections',
      initialArgs,
      false
    )
  } catch (failure) {
    error = failure instanceof Error ? failure.message : 'Unable to display the result.'
  }
  render()
}
app.ontoolcancelled = () => {
  ++requestId
  activeRequest?.abort()
  busy = false
  failedRead = undefined
  error = 'The request was cancelled. Refresh to try again.'
  render()
}
app.onhostcontextchanged = applyContext
app.onteardown = async () => {
  ++requestId
  activeRequest?.abort()
  return {}
}
render()
try {
  await app.connect()
  connected = true
  applyContext(app.getHostContext())
} catch {
  error = 'Unable to connect to the host. Reopen this app from Durabull’s tool result.'
  render()
}
