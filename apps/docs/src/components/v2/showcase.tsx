'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Activity, Bug, CalendarClock, Check, ScrollText, TrendingUp } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import { Reveal } from './reveal'

interface Tab {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  kicker: string
  title: string
  body: string
  bullets: string[]
  screenshot: string
  alt: string
}

const tabs: Tab[] = [
  {
    id: 'queues',
    label: 'queues',
    icon: Activity,
    kicker: 'Queue command center',
    title: 'Every queue, one live surface',
    body: 'Connection-scoped dashboard with live counts for waiting, active, delayed, completed, failed, and paused jobs. Queues are discovered automatically from BullMQ meta keys.',
    bullets: [
      'Drill from fleet view to queue to job in seconds',
      'Pause, resume, and clean queues with grace periods',
      'Purge and delete guarded by exact-name confirmation',
    ],
    screenshot: '/screenshots/queues.png',
    alt: 'Durabull queues dashboard showing live job counts across every queue.',
  },
  {
    id: 'debugging',
    label: 'debugging',
    icon: Bug,
    kicker: 'Failure analysis',
    title: 'Root cause without the guesswork',
    body: 'Open any failed job and see payload, options, progress, attempt history, return values, and full stack traces — everything an incident needs, in one place.',
    bullets: [
      'Retry one job or bulk-replay up to 100 at a time',
      'Invoke delayed jobs now, remove, or add jobs manually',
      'Filter paginated job lists by status and job name',
    ],
    screenshot: '/screenshots/failed.png',
    alt: 'Durabull failure debugging view with stack traces and attempt history.',
  },
  {
    id: 'schedulers',
    label: 'schedulers',
    icon: CalendarClock,
    kicker: 'Scheduled jobs',
    title: 'Cron visibility that scales',
    body: 'A global view of scheduled jobs across queues, plus a per-queue workspace to create, edit, and remove schedulers with cron, timezones, intervals, and run limits.',
    bullets: [
      'Next-run context and recent failures per schedule',
      'Cron + timezone, fixed intervals, start/end dates',
      'Template options: attempts, priority, backoff, retention',
    ],
    screenshot: '/screenshots/scheduled.png',
    alt: 'Durabull scheduled jobs view with cron schedules and next run times.',
  },
  {
    id: 'logs',
    label: 'logs',
    icon: ScrollText,
    kicker: 'Live logs',
    title: 'Execution logs beside queue state',
    body: 'Track logs while jobs run, with structured parsing when workers emit the recommended format: level badges, context tags, key/value highlighting, and search.',
    bullets: [
      'Level and context badges with key=value coloring',
      'Search and long-line truncation built in',
      'Pinpoint anomalies without opening another tool',
    ],
    screenshot: '/screenshots/logging.png',
    alt: 'Durabull live logs view with structured log parsing and highlighting.',
  },
  {
    id: 'fleet',
    label: 'fleet analytics',
    icon: TrendingUp,
    kicker: 'Fleet analytics',
    title: 'Cross-queue operational intelligence',
    body: 'A fleet health score, throughput series, backlog charts, failure rates, worker state breakdowns, and scheduler insights — built from BullMQ-native metrics.',
    bullets: [
      'Top risk queues with a "show only risky" toggle',
      'Worker states: active, warm, stale — plus top idle workers',
      'Next-24h scheduler load and actionable warning signals',
    ],
    screenshot: '/screenshots/fleet-analytics-throughput.png',
    alt: 'Durabull Fleet Analytics throughput trends across the worker fleet.',
  },
]

export function V2Showcase() {
  const [active, setActive] = useState(0)
  const reduceMotion = useReducedMotion()

  return (
    <section id="product" className="v2-dark relative scroll-mt-20 bg-[var(--v2-bg)] py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="text-center">
          <h2 className="v2-h text-balance text-3xl leading-tight text-[var(--v2-fg)] sm:text-4xl">
            Everything you need to operate queues
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--v2-muted)]">
            Durabull unifies your entire queue lifecycle — monitoring, debugging, scheduling, and
            fleet intelligence — into a single surface.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          {/* tab bar */}
          <div
            className="mt-12 flex overflow-x-auto border-b border-[var(--v2-line)]"
            role="tablist"
          >
            {tabs.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active === i}
                data-active={active === i}
                onClick={() => setActive(i)}
                className="v2-tab v2-mono flex shrink-0 items-center gap-2 px-5 py-3.5 sm:px-7"
              >
                <t.icon className="size-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* panel — all tabs stay mounted, stacked in the same grid cell, so the
              container height never collapses mid-transition (no layout glitch). */}
          <div className="grid border border-t-0 border-[var(--v2-line)]">
            {tabs.map((tab, i) => {
              const isActive = active === i
              return (
                <motion.div
                  key={tab.id}
                  role="tabpanel"
                  aria-hidden={!isActive}
                  initial={false}
                  animate={
                    reduceMotion
                      ? { opacity: isActive ? 1 : 0 }
                      : { opacity: isActive ? 1 : 0, y: isActive ? 0 : 12 }
                  }
                  transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                  className={`grid [grid-area:1/1] lg:grid-cols-[0.85fr_1.15fr] ${
                    isActive ? '' : 'pointer-events-none'
                  }`}
                >
                  <div className="flex flex-col justify-center p-8 sm:p-10">
                    <p className="v2-mono text-[var(--v2-accent)]">{tab.kicker}</p>
                    <h3 className="v2-h mt-3 text-2xl text-[var(--v2-fg)] sm:text-[28px]">
                      {tab.title}
                    </h3>
                    <p className="mt-4 text-[14.5px] leading-relaxed text-[var(--v2-muted)]">
                      {tab.body}
                    </p>
                    <ul className="mt-6 space-y-3">
                      {tab.bullets.map((bullet) => (
                        <li
                          key={bullet}
                          className="flex items-start gap-2.5 text-[14px] text-[var(--v2-muted)]"
                        >
                          <Check className="mt-0.5 size-4 shrink-0 text-[var(--v2-accent)]" />
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="v2-shot-bg relative overflow-hidden border-t border-[var(--v2-line)] p-6 lg:border-l lg:border-t-0 lg:p-10">
                    <div className="v2-frame relative rounded-lg">
                      <Image
                        src={tab.screenshot}
                        alt={tab.alt}
                        width={1400}
                        height={875}
                        className="w-full"
                      />
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
