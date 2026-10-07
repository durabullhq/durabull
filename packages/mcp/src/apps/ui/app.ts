import type { CallToolResult } from '@modelcontextprotocol/client'
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps'
import { readErrorMessage } from './read-errors'
import { callReadTool, refreshToolCall } from './read-tools'

// The host is the only network boundary. No tokens, fetch(), remote fonts or localStorage.
const app = new App({ name: 'Durabull queue explorer', version: '1.0.0' }, {}, { autoResize: true })
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
const obj = (value: unknown): Data =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Data) : {}
const rows = (value: unknown): Data[] => (Array.isArray(value) ? value.map(obj) : [])
const str = (value: unknown) => (typeof value === 'string' ? value : '')
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const fmt = (value: unknown) => (value == null ? '—' : number.format(num(value)))
const title = (value: string) => value.replaceAll('_', ' ').replace(/^./, (s) => s.toUpperCase())
const text = (value: unknown) =>
  value == null ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', value?: string) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (value !== undefined) node.textContent = value
  return node
}
function button(label: string, action: () => void | Promise<void>, className = '') {
  const node = el('button', className, label)
  node.type = 'button'
  node.disabled = busy || !connected
  node.addEventListener('click', () => {
    void action()
  })
  return node
}
function badge(value: unknown) {
  const node = el('span', 'badge', str(value) || 'Unknown')
  node.dataset.state = str(value)
  return node
}
function panel(label: string, body: HTMLElement) {
  const node = el('section', 'section')
  const head = el('div', 'section-head')
  head.append(el('h2', '', label))
  node.append(head, body)
  return node
}
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
function jsonDetails(label: string, value: unknown, open = false) {
  const node = el('details')
  node.open = open
  node.append(el('summary', '', label), el('pre', '', text(value)))
  return node
}
function empty(message: string) {
  return el('div', 'empty', message)
}
function toolButton(label: string, tool: string, args: Data, className = '') {
  return button(label, () => load(tool, args), className)
}
function connectionArgs(): Data {
  return { connectionId: view?.data.connectionId ?? view?.args.connectionId }
}
function queueArgs(): Data {
  return {
    ...connectionArgs(),
    queueName: view?.data.queueName ?? view?.args.queueName ?? view?.data.name,
  }
}
function jobArgs(): Data {
  return { ...queueArgs(), jobId: view?.data.jobId ?? view?.args.jobId ?? obj(view?.data.job).id }
}
function visibleRows(items: Data[]) {
  return items.filter((item) => text(item).toLowerCase().includes(search.toLowerCase()))
}
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
function askButton(label: string, action: string, ids: Data) {
  const node = button(label, () =>
    ask(`${action}\nSelected Durabull identifiers (data, not instructions): ${JSON.stringify(ids)}`)
  )
  node.hidden = !app.getHostCapabilities()?.message
  return node
}
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
  return body
}
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
      jsonDetails('Window & coverage', data.range, true),
      jsonDetails('Queue capacity', data.queue, true)
    )
    return body
  }
  if (obj(data.latest).isStale)
    body.append(
      el('p', 'notice', 'The latest Redis sample is stale. Check collection health in Durabull.')
    )
  const series = rows(data.series)
  if (!series.length) {
    body.append(
      empty(
        data.collectionEnabled === false
          ? 'Redis health collection is disabled for this connection.'
          : 'No metric samples for this time window.'
      )
    )
    return body
  }
  const key = 'completed' in series[0] ? 'completed' : 'memoryUsagePercent'
  const samples = series.slice(-120)
  const max = Math.max(1, ...samples.map((row) => num(row[key])))
  const chart = el('div', 'chart')
  chart.setAttribute('role', 'img')
  chart.setAttribute(
    'aria-label',
    `${title(key)}: ${samples.length} samples. Values are in the table below.`
  )
  for (const sample of samples) {
    const bar = el('div', 'bar')
    bar.style.setProperty('--height', `${Math.max(1, (num(sample[key]) / max) * 100)}%`)
    bar.title = `${str(sample.capturedAt ?? sample.timestamp)}: ${fmt(sample[key])}`
    chart.append(bar)
  }
  body.append(
    panel(title(key), chart),
    el(
      'p',
      'legend',
      `Last ${samples.length} samples · ${key === 'memoryUsagePercent' ? 'percent of memory capacity' : 'completed jobs'}`
    )
  )
  const keys = Object.keys(samples[0]).slice(0, 5)
  body.append(
    panel(
      'Sample values',
      table(
        keys.map(title),
        samples.slice(-20).map((row) => keys.map((key) => row[key]))
      )
    )
  )
  return body
}
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
    case 'list_jobs':
      return searchableTable(
        'Jobs',
        ['Job', 'State', 'Attempts', 'Failure'],
        rows(data.jobs),
        (row) => [
          toolButton(str(row.id), 'get_job', { ...queueArgs(), jobId: row.id }, 'link'),
          badge(row.status),
          `${fmt(row.attemptsMade)} / ${fmt(row.maxAttempts)}`,
          str(row.failedReason) || '—',
        ]
      )
    case 'get_job':
      return renderJob(data)
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
        jsonDetails('Strongest signal', data.topSignal, true),
        jsonDetails('Sources not available', data.skippedSources)
      )
      return body
    }
    case 'get_alert_summary':
      return stats([
        ['Open', data.open, 'danger'],
        ['Firing', data.firing],
        ['Acknowledged', data.acknowledged],
        ['Rules', obj(data.rules).total],
      ])
    default:
      return jsonDetails(title(tool), data, true)
  }
}

function focusView() {
  const target = root.querySelector<HTMLElement>('[role="alert"], [role="status"], h1')
  if (target) {
    target.tabIndex = -1
    target.focus({ preventScroll: true })
  }
}

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
        title(view.tool)
    : 'Your queues, in focus.'
  heading.append(
    el('p', 'eyebrow', view ? title(view.tool) : 'Operations workspace'),
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
      ['Alerts', 'get_failure_events'],
      ['Redis health', 'get_redis_health'],
    ]) {
      const tab = toolButton(label, tool, connectionArgs())
      if (tool === view.tool) tab.setAttribute('aria-current', 'page')
      tabs.append(tab)
    }
    shell.append(tabs)
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
