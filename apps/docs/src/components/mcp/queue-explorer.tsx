'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Maximize2, MessageSquareText, RefreshCw, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { useId, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Marketing recreation of the Durabull Queue Explorer MCP App
 * (packages/mcp/src/apps/ui). Fixture data only — mirrors the real
 * app's layout, labels, and read-only / "Ask to…" interaction model.
 */

export type ExplorerView =
  | 'overview'
  | 'queues'
  | 'workers'
  | 'schedules'
  | 'incidents'
  | 'alerts'
  | 'rules'
  | 'redis'
  | 'investigation'

const TABS: { id: ExplorerView; label: string }[] = [
  { id: 'queues', label: 'Queues' },
  { id: 'workers', label: 'Workers' },
  { id: 'schedules', label: 'Schedules' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'rules', label: 'Rules' },
  { id: 'redis', label: 'Redis health' },
]

interface ViewMeta {
  eyebrow: string
  title: string
  subtitle?: string
  /** read tool that backs this view, shown in the footer */
  tool: string
  /** detail views drop the section tabs and job search, as in the real app */
  detail?: boolean
}

const LIVE_SUBTITLE = 'Live snapshots from your connected Durabull workspace.'

const VIEW_META: Record<ExplorerView, ViewMeta> = {
  overview: { eyebrow: 'Connection health', title: 'Production', tool: 'get_connection_overview' },
  queues: { eyebrow: 'Queues', title: 'Queues', tool: 'list_queues' },
  workers: { eyebrow: 'Workers', title: 'Workers', tool: 'get_workers' },
  schedules: { eyebrow: 'Recurring schedules', title: 'Schedules', tool: 'list_scheduled_jobs' },
  incidents: { eyebrow: 'Incidents', title: 'Incidents', tool: 'get_alert_summary' },
  alerts: { eyebrow: 'Alert activity', title: 'Alerts', tool: 'get_failure_events' },
  rules: { eyebrow: 'Alert rules', title: 'Rules', tool: 'list_alert_rules' },
  redis: { eyebrow: 'Redis health', title: 'Redis health', tool: 'get_redis_health' },
  investigation: {
    eyebrow: 'Failure investigation',
    title: 'Job 48213',
    subtitle: 'email:receipts · send-receipt',
    tool: 'explain_job_failure',
    detail: true,
  },
}

/* ---------------- building blocks ---------------- */

function Stats({ items }: { items: { label: string; value: string; tone?: 'bad' | 'accent' }[] }) {
  return (
    <div className="dbx-card grid grid-cols-2 overflow-hidden sm:grid-cols-4">
      {items.map((s, i) => (
        <div
          key={s.label}
          className={cn(
            'border-[var(--x-line)] px-4 py-3.5',
            i % 2 === 1 && 'border-l',
            i >= 2 && 'border-t sm:border-t-0',
            i >= 1 && 'sm:border-l'
          )}
        >
          <p className="dbx-label">{s.label}</p>
          <p
            className="mt-1 text-[26px] font-medium leading-none tracking-tight"
            style={{
              color:
                s.tone === 'bad'
                  ? 'var(--x-bad)'
                  : s.tone === 'accent'
                    ? 'var(--x-accent)'
                    : undefined,
            }}
          >
            {s.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function Table({
  title,
  head,
  rows,
  action = 'Inspect →',
}: {
  title?: string
  head: string[]
  rows: ReactNode[][]
  action?: string | null
}) {
  return (
    <div className="dbx-card overflow-hidden">
      {title ? <p className="px-4 py-3 text-[14px] font-semibold">{title}</p> : null}
      <div className="overflow-x-auto">
        <table className="dbx-table w-full text-[12.5px]">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
              {action ? <th aria-hidden /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
                {action ? (
                  <td className="text-right font-semibold text-[var(--x-accent)]">{action}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Pill({ children, tone }: { children: ReactNode; tone?: 'bad' | 'ok' | 'warn' | 'muted' }) {
  const color =
    tone === 'bad'
      ? 'var(--x-bad)'
      : tone === 'ok'
        ? 'var(--x-accent)'
        : tone === 'warn'
          ? 'var(--x-warn)'
          : 'var(--x-muted)'
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ color, borderColor: 'var(--x-line)' }}
    >
      <span className="inline-block size-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  )
}

function AskButton({ children, onAsk }: { children: ReactNode; onAsk?: () => void }) {
  return (
    <button
      type="button"
      onClick={onAsk}
      className="dbx-btn-ask inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold"
    >
      <MessageSquareText className="size-3.5" />
      {children}
    </button>
  )
}

/* ---------------- views ---------------- */

const REDIS_SERIES = [
  41, 42, 42, 44, 43, 45, 47, 46, 48, 0, 0, 51, 53, 52, 55, 58, 57, 61, 63, 62, 64, 66, 65, 68, 71,
  69, 72, 74, 73, 76, 78, 77, 74, 72, 70, 69, 67, 68, 66, 64,
]

function ViewBody({ view, onAsk }: { view: ExplorerView; onAsk?: (text: string) => void }) {
  switch (view) {
    case 'overview':
      return (
        <>
          <Stats
            items={[
              { label: 'Waiting', value: '128' },
              { label: 'Active', value: '12', tone: 'accent' },
              { label: 'Failed', value: '7', tone: 'bad' },
              { label: 'Workers', value: '12' },
            ]}
          />
          <Table
            title="Queues needing attention"
            head={['Queue', 'Failed']}
            rows={[['email:receipts', '7']]}
          />
          <Table
            title="Largest backlog"
            head={['Queue', 'Waiting']}
            rows={[
              ['email:receipts', '128'],
              ['image:resize', '26'],
            ]}
          />
        </>
      )
    case 'queues':
      return (
        <Table
          head={['Queue', 'State', 'Waiting', 'Active', 'Failed', 'Delayed']}
          rows={[
            [
              'email:receipts',
              <Pill key="s" tone="ok">
                Running
              </Pill>,
              '128',
              '4',
              <span key="f" className="text-[var(--x-bad)]">
                7
              </span>,
              '0',
            ],
            [
              'image:resize',
              <Pill key="s" tone="ok">
                Running
              </Pill>,
              '26',
              '6',
              '0',
              '2',
            ],
            [
              'webhooks:stripe',
              <Pill key="s" tone="ok">
                Running
              </Pill>,
              '3',
              '2',
              '0',
              '0',
            ],
            [
              'reports:nightly',
              <Pill key="s" tone="warn">
                Paused
              </Pill>,
              '0',
              '0',
              '0',
              '1',
            ],
            [
              'search:reindex',
              <Pill key="s" tone="ok">
                Running
              </Pill>,
              '0',
              '0',
              '0',
              '0',
            ],
          ]}
        />
      )
    case 'workers':
      return (
        <Table
          head={['Worker', 'Queue', 'Address', 'Age', 'Idle']}
          rows={[
            ['w-7f3a', 'email:receipts', '10.0.4.12', '3h 12m', '0s'],
            ['w-91bc', 'email:receipts', '10.0.4.13', '3h 12m', '2s'],
            ['w-c044', 'image:resize', '10.0.6.21', '48m', '0s'],
            ['w-c045', 'image:resize', '10.0.6.22', '48m', '1s'],
            ['w-2e18', 'webhooks:stripe', '10.0.2.7', '6d 2h', '4s'],
          ]}
          action={null}
        />
      )
    case 'schedules':
      return (
        <>
          <Table
            head={['Scheduler', 'Queue', 'Pattern', 'Timezone', 'Next run']}
            rows={[
              [
                'nightly-rollup',
                'reports:nightly',
                <code key="p">0 2 * * *</code>,
                'America/New_York',
                '02:00',
              ],
              [
                'digest-weekly',
                'email:receipts',
                <code key="p">0 9 * * MON</code>,
                'UTC',
                'Mon 09:00',
              ],
              ['reindex-hourly', 'search:reindex', <code key="p">every 1h</code>, '—', '14:00'],
            ]}
          />
          <p className="text-[11.5px] text-[var(--x-muted)]">
            &ldquo;Next run&rdquo; is the scheduled time, not proof of execution.
          </p>
        </>
      )
    case 'incidents':
      return (
        <>
          <Stats
            items={[
              { label: 'Open', value: '2', tone: 'bad' },
              { label: 'Unacknowledged', value: '2' },
              { label: 'Acknowledged', value: '0' },
              { label: 'Rules', value: '4' },
            ]}
          />
          <Table
            title="Open incidents by queue"
            head={['Queue', 'Open']}
            rows={[
              [
                <span key="q" className="font-semibold text-[var(--x-accent)]">
                  email:receipts
                </span>,
                '2',
              ],
            ]}
            action={null}
          />
          <Table
            title="Open incidents by rule"
            head={['Rule', 'Open']}
            rows={[
              [
                <span key="r" className="font-semibold text-[var(--x-accent)]">
                  Receipt delivery failures
                </span>,
                '2',
              ],
            ]}
            action={null}
          />
        </>
      )
    case 'alerts':
      return (
        <Table
          head={['Event', 'Rule', 'Status', 'Fired']}
          rows={[
            [
              'evt_8c21',
              'Receipt delivery failures',
              <Pill key="s" tone="bad">
                Firing
              </Pill>,
              '13:52',
            ],
            [
              'evt_8c1f',
              'Receipt delivery failures',
              <Pill key="s" tone="bad">
                Firing
              </Pill>,
              '13:41',
            ],
            [
              'evt_8b90',
              'Resize backlog > 500',
              <Pill key="s" tone="ok">
                Resolved
              </Pill>,
              '11:07',
            ],
            [
              'evt_8b02',
              'Stripe webhook failure rate',
              <Pill key="s" tone="muted">
                Suppressed
              </Pill>,
              '09:30',
            ],
          ]}
        />
      )
    case 'rules':
      return (
        <>
          <Table
            head={['Rule', 'Type', 'State', 'Cooldown', 'Open']}
            rows={[
              [
                'Receipt delivery failures',
                'failure threshold',
                <Pill key="s" tone="bad">
                  Firing
                </Pill>,
                '15m',
                '2',
              ],
              [
                'Resize backlog > 500',
                'backlog',
                <Pill key="s" tone="ok">
                  Active
                </Pill>,
                '30m',
                '0',
              ],
              [
                'Stripe webhook failure rate',
                'failure rate',
                <Pill key="s" tone="warn">
                  Snoozed
                </Pill>,
                '10m',
                '0',
              ],
              [
                'Nightly stalled',
                'stalled queue',
                <Pill key="s" tone="ok">
                  Active
                </Pill>,
                '1h',
                '0',
              ],
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <AskButton onAsk={() => onAsk?.('Snooze “Receipt delivery failures” for 1 hour')}>
              Ask to snooze for 1 hour
            </AskButton>
          </div>
        </>
      )
    case 'redis':
      return (
        <>
          <Stats
            items={[
              { label: 'Memory %', value: '64' },
              { label: 'CPU %', value: '18' },
              { label: 'Connected clients', value: '41' },
              { label: 'Evictions / minute', value: '0', tone: 'accent' },
            ]}
          />
          <div className="dbx-card p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[14px] font-semibold">Memory % · last 6 hours</p>
              <p className="text-[11px] text-[var(--x-muted)]">gaps = unsampled</p>
            </div>
            <div
              role="img"
              aria-label="Bar chart of Redis memory percent rising from 41% to a 78% peak, now 64%."
              className="mt-4 flex h-28 items-end gap-[3px]"
            >
              {REDIS_SERIES.map((v, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t-[2px]"
                  style={{
                    height: v ? `${v}%` : '0%',
                    background: v >= 75 ? 'var(--x-warn)' : 'var(--x-accent)',
                    opacity: v ? 0.85 : 0,
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10.5px] text-[var(--x-faint)]">
              <span>08:00</span>
              <span>threshold 80%</span>
              <span>14:00</span>
            </div>
          </div>
        </>
      )
    case 'investigation':
      return (
        <>
          <div className="dbx-card space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="bad">Failed</Pill>
              <Pill>Attempts 3 / 3</Pill>
              <Pill tone="ok">Confidence: high</Pill>
            </div>
            <p className="text-[13px] leading-relaxed">
              All three attempts failed with the same SMTP rejection. The provider is throttling
              sends from this account.
            </p>
            <pre className="dbx-pre overflow-x-auto px-3 py-2.5 text-[var(--x-bad)]">
              Error: 421 4.7.0 Try again later, rate limited{'\n'}
              {'    '}at SmtpTransport.send (mailer/transport.ts:88)
            </pre>
          </div>
          <div className="dbx-card overflow-hidden">
            <p className="px-4 py-3 text-[14px] font-semibold">Attempt timeline</p>
            <table className="dbx-table w-full text-[12.5px]">
              <tbody>
                {[
                  ['#1', '13:41:02', 'failed', 'backoff 30s'],
                  ['#2', '13:41:33', 'failed', 'backoff 60s'],
                  ['#3', '13:42:34', 'failed', 'exhausted'],
                ].map(([n, t, s, b]) => (
                  <tr key={n}>
                    <td className="font-mono">{n}</td>
                    <td className="font-mono text-[var(--x-muted)]">{t}</td>
                    <td className="text-[var(--x-bad)]">{s}</td>
                    <td className="text-[var(--x-muted)]">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <span aria-hidden className="dbx-btn px-3 py-1.5 text-[12px]">
              Logs
            </span>
            <span aria-hidden className="dbx-btn px-3 py-1.5 text-[12px]">
              Stacktraces
            </span>
            <AskButton onAsk={() => onAsk?.('Retry job 48213 in email:receipts')}>
              Ask to retry
            </AskButton>
          </div>
        </>
      )
  }
}

/* ---------------- the app shell ---------------- */

export function QueueExplorer({
  initialView = 'overview',
  theme = 'light',
  showSearch = true,
  onAsk,
}: {
  initialView?: ExplorerView
  theme?: 'light' | 'dark'
  showSearch?: boolean
  onAsk?: (text: string) => void
}) {
  const [view, setView] = useState<ExplorerView>(initialView)
  const reduceMotion = useReducedMotion()
  const panelId = useId()
  const meta = VIEW_META[view]
  const showTabs = !meta.detail

  return (
    <div data-theme={theme} className="dbx overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--x-line)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-6 place-items-center rounded-md bg-[var(--x-accent)] text-[12px] font-black text-[var(--x-card)]">
            d.
          </span>
          <span className="text-[11px] font-extrabold tracking-[0.14em]">
            DURABULL <span className="text-[var(--x-muted)]">/ QUEUE EXPLORER</span>
          </span>
        </div>
        <div aria-hidden className="flex items-center gap-1.5">
          <span className="dbx-btn hidden items-center gap-1 px-2 py-1 text-[11px] sm:inline-flex">
            <Maximize2 className="size-3" /> Expand
          </span>
          <span className="dbx-btn inline-flex items-center gap-1 px-2 py-1 text-[11px]">
            <RefreshCw className="size-3" /> Refresh
          </span>
        </div>
      </div>

      <div className="space-y-3.5 p-4">
        {/* breadcrumbs */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <button
            type="button"
            onClick={() => setView('overview')}
            className="dbx-btn inline-flex items-center gap-1 px-2 py-0.5"
          >
            <ArrowLeft className="size-3" /> Back
          </button>
          <span aria-hidden className="dbx-btn px-2 py-0.5">
            Connections
          </span>
          <span aria-hidden className="dbx-btn px-2 py-0.5">
            Connection overview
          </span>
        </div>

        <div>
          <p className="dbx-label">{meta.eyebrow}</p>
          <p className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">
            {meta.title}
          </p>
          <p className="mt-1 text-[11.5px] text-[var(--x-muted)]">
            {meta.subtitle ?? LIVE_SUBTITLE}
          </p>
        </div>

        {showTabs ? (
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Explorer sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={view === t.id}
                aria-controls={panelId}
                data-active={view === t.id}
                onClick={() => setView(t.id)}
                className="dbx-btn px-2.5 py-1 text-[12px]"
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}

        {showTabs && showSearch ? (
          <div aria-hidden className="dbx-card flex items-center gap-2 p-2">
            <span className="flex flex-1 items-center gap-2 rounded-md border border-[var(--x-line)] bg-[var(--x-sunk)] px-2.5 py-1.5 text-[12px] text-[var(--x-faint)]">
              <Search className="size-3.5" /> Exact job ID…
            </span>
            <span className="dbx-btn px-2.5 py-1.5 text-[12px]">Find job</span>
          </div>
        ) : null}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            id={panelId}
            role={showTabs ? 'tabpanel' : undefined}
            aria-label={meta.title}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="space-y-3.5"
          >
            <ViewBody view={view} onAsk={onAsk} />
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between border-t border-[var(--x-line)] pt-3 text-[10.5px] text-[var(--x-faint)]">
          <span>Scoped access · Sensitive values redacted</span>
          <span className="font-mono">{meta.tool}</span>
        </div>
      </div>
    </div>
  )
}
