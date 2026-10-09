'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Eyebrow, Reveal } from '../v2/reveal'
import { AgentFrame, AgentMsg, ResultCard, ToolPill, UsedDurabull, UserMsg } from './primitives'

interface Capability {
  id: string
  eyebrow: string
  title: string
  body: string
  tools: { name: string; write?: boolean }[]
  chat: ReactNode
}

const capabilities: Capability[] = [
  {
    id: 'fleet',
    eyebrow: 'Fleet health',
    title: 'Every queue, one question away.',
    body: 'One call checks up to 100 queues: backlog, failures, paused queues, queues waiting with no workers, open alerts, and the latest Redis sample. Your agent knows where to look before you do.',
    tools: [
      { name: 'get_connection_overview' },
      { name: 'list_queues' },
      { name: 'get_queue' },
      { name: 'get_workers' },
      { name: 'get_queue_metrics' },
    ],
    chat: (
      <>
        <UserMsg>Anything in production I should worry about?</UserMsg>
        <UsedDurabull tools={['get_connection_overview']} />
        <AgentMsg>
          One thing: <b>image:resize</b> has 26 jobs waiting and no workers attached. Everything
          else is draining normally.
        </AgentMsg>
        <ResultCard
          title="Production"
          status="1 needs attention"
          tone="accent"
          rows={[
            ['Waiting · Active · Failed', '154 · 12 · 7'],
            ['Waiting without workers', 'image:resize'],
            ['Workers online', '12'],
          ]}
        />
      </>
    ),
  },
  {
    id: 'triage',
    eyebrow: 'Failure triage',
    title: 'Root cause in a sentence.',
    body: 'Find a job across queues by ID, read its logs and per-attempt stack traces, and get a deterministic failure explanation with a confidence level and a list of any evidence it could not see.',
    tools: [
      { name: 'find_job' },
      { name: 'get_job' },
      { name: 'get_job_logs' },
      { name: 'get_job_stacktraces' },
      { name: 'explain_job_failure' },
    ],
    chat: (
      <>
        <UserMsg>Job 48213 failed. Why?</UserMsg>
        <UsedDurabull tools={['find_job', 'explain_job_failure']} />
        <AgentMsg>
          It&apos;s in <b>email:receipts</b>. All 3 attempts hit the same SMTP rate limit. The stack
          trace and the failure reason agree, so confidence is high.
        </AgentMsg>
        <ResultCard
          title="job 48213 · send-receipt"
          status="Failed"
          tone="bad"
          rows={[
            ['Strongest signal', '421 4.7.0 rate limited'],
            ['Attempts', '3 of 3'],
            ['Confidence', 'High'],
          ]}
        />
      </>
    ),
  },
  {
    id: 'recover',
    eyebrow: 'Recovery',
    title: 'Fix it, with your say-so.',
    body: 'Retry failed jobs, promote delayed ones, and pause or resume queues. Writes need scopes you approve separately, check the job’s state first, and return a receipt showing the state before and after.',
    tools: [
      { name: 'retry_job', write: true },
      { name: 'promote_job', write: true },
      { name: 'pause_queue', write: true },
      { name: 'resume_queue', write: true },
    ],
    chat: (
      <>
        <UserMsg>The provider is back. Retry 48213 and resume reports:nightly.</UserMsg>
        <UsedDurabull tools={['retry_job', 'resume_queue']} />
        <AgentMsg>
          Done. Both changes went through, and I re-read them afterwards to confirm the new state.
        </AgentMsg>
        <ResultCard
          title="Operation receipt"
          status="Applied"
          tone="ok"
          rows={[
            ['job 48213', 'failed → waiting'],
            ['reports:nightly', 'paused → running'],
          ]}
        >
          <p className="border-t border-[var(--v2-line)] px-4 py-2 text-[11px] text-[var(--v2-faint)]">
            Queued work is not proof of successful completion.
          </p>
        </ResultCard>
      </>
    ),
  },
  {
    id: 'incidents',
    eyebrow: 'Incidents & alerts',
    title: 'Run the incident from the chat.',
    body: 'See what’s firing by queue and rule, check whether each notification was delivered, and acknowledge, resolve, or snooze a noisy rule for up to seven days. Linked Linear issues close when an incident resolves.',
    tools: [
      { name: 'get_alert_summary' },
      { name: 'get_failure_events' },
      { name: 'get_alert_event' },
      { name: 'acknowledge_alert_event', write: true },
      { name: 'resolve_alert_event', write: true },
      { name: 'snooze_alert_rule', write: true },
    ],
    chat: (
      <>
        <UserMsg>Ack the receipt alerts and snooze that rule for an hour.</UserMsg>
        <UsedDurabull tools={['acknowledge_alert_event', 'snooze_alert_rule']} />
        <AgentMsg>
          Both incidents are acknowledged under your name. “Receipt delivery failures” is snoozed
          until 15:04.
        </AgentMsg>
        <ResultCard
          title="Receipt delivery failures"
          status="Snoozed"
          tone="accent"
          rows={[
            ['Open incidents', '2 · acknowledged'],
            ['Notifications', 'email ✓ · webhook ✓ · linear ✓'],
            ['Snoozed until', '15:04'],
          ]}
        />
      </>
    ),
  },
]

const secondaryCapabilities = [
  {
    eyebrow: 'Schedulers',
    title: 'Know what runs next.',
    body: 'Cron patterns, intervals, timezones, next runs, and recent failures for every scheduler on a connection.',
    tools: ['list_scheduled_jobs', 'get_scheduled_job'],
    prompt: 'What’s scheduled to run overnight?',
    rows: [
      ['nightly-rollup', '0 2 * * * · 02:00 ET'],
      ['reindex-hourly', 'every 1h · 14:00'],
      ['digest-weekly', 'Mon 09:00 UTC'],
    ] as [string, string][],
  },
  {
    eyebrow: 'Redis health',
    title: 'Catch memory pressure early.',
    body: 'Memory, CPU, clients, evictions, and fragmentation, plus up to 30 days of history checked against your thresholds.',
    tools: ['get_redis_health', 'get_queue_metrics'],
    prompt: 'Is Redis under memory pressure?',
    rows: [
      ['Memory', '64% · threshold 80%'],
      ['Evictions / min', '0'],
      ['6h peak', '78% at 12:40'],
    ] as [string, string][],
  },
]

function Stage({ children, flip }: { children: ReactNode; flip?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-[var(--v2-line)] bg-[var(--v2-bg-2)] p-5 sm:p-10">
      <div aria-hidden className="v2-blueprint absolute inset-0 opacity-70" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: flip
            ? 'radial-gradient(60% 60% at 100% 100%, rgba(249,115,22,0.12), transparent 70%)'
            : 'radial-gradient(60% 60% at 0% 100%, rgba(249,115,22,0.12), transparent 70%)',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}

export function McpCapabilities() {
  return (
    <section id="capabilities" className="relative scroll-mt-20 bg-[var(--v2-bg)] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <div className="flex justify-center">
            <Eyebrow>Ask your agent</Eyebrow>
          </div>
          <h2 className="v2-h mt-4 text-balance text-3xl leading-tight sm:text-5xl">
            The whole queue lifecycle, in plain language.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[15.5px] leading-relaxed text-[var(--v2-muted)]">
            Your agent works against live Durabull data with the access you grant it. Everything it
            does also shows up in the dashboard.
          </p>
        </Reveal>

        <div className="mt-20 space-y-24 sm:space-y-32">
          {capabilities.map((c, i) => {
            const flip = i % 2 === 1
            return (
              <div
                key={c.id}
                className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16"
              >
                <Reveal className={cn('min-w-0', flip && 'lg:order-2')}>
                  <p className="v2-mono flex items-center gap-3 text-[var(--v2-accent)]">
                    <span className="font-semibold text-[var(--v2-faint)]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {c.eyebrow}
                  </p>
                  <h3 className="v2-h mt-4 text-balance text-3xl leading-[1.1] sm:text-[40px]">
                    {c.title}
                  </h3>
                  <p className="mt-5 max-w-md text-[15.5px] leading-relaxed text-[var(--v2-muted)]">
                    {c.body}
                  </p>
                  <div className="mt-7 flex flex-wrap gap-2">
                    {c.tools.map((t) => (
                      <ToolPill key={t.name} name={t.name} write={t.write} />
                    ))}
                  </div>
                </Reveal>
                <Reveal delay={0.1} className={cn('min-w-0', flip && 'lg:order-1')}>
                  <Stage flip={flip}>
                    <AgentFrame className="mx-auto max-w-lg">{c.chat}</AgentFrame>
                  </Stage>
                </Reveal>
              </div>
            )
          })}
        </div>

        {/* secondary capabilities */}
        <div className="mt-24 grid gap-5 sm:mt-32 lg:grid-cols-2">
          {secondaryCapabilities.map((m, i) => (
            <Reveal key={m.eyebrow} delay={i * 0.08}>
              <div className="v2-card flex h-full flex-col rounded-3xl p-7 sm:p-9">
                <p className="v2-mono text-[var(--v2-accent)]">{m.eyebrow}</p>
                <h3 className="v2-h mt-3 text-2xl sm:text-[28px]">{m.title}</h3>
                <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-[var(--v2-muted)]">
                  {m.body}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {m.tools.map((t) => (
                    <ToolPill key={t} name={t} />
                  ))}
                </div>
                <div className="mt-7 flex-1 space-y-3 rounded-2xl border border-[var(--v2-line)] bg-[var(--v2-bg-2)] p-4">
                  <UserMsg>{m.prompt}</UserMsg>
                  <UsedDurabull tools={[m.tools[0]]} />
                  <ResultCard title={m.eyebrow} rows={m.rows} />
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12.5px] text-[var(--v2-faint)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-1.5 rounded-full bg-[var(--v2-ok)]" /> Read tool
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-1.5 rounded-full bg-[var(--v2-accent)]" /> Write tool
            · separate scope
          </span>
          <span>Example conversations use fixture data.</span>
        </Reveal>
      </div>
    </section>
  )
}
