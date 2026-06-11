'use client'

import { Check, Copy, Terminal } from 'lucide-react'
import { useState } from 'react'
import { HOMEBREW_INSTALL_COMMAND } from '@/lib/config'
import { CornerMarks, Eyebrow, Reveal } from './reveal'

/* ---------------- getting started / install ---------------- */

function CommandBlock({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="v2-cmd rounded-lg">
      <div className="flex items-center justify-between border-b border-[var(--v2-line)] px-4 py-2">
        <span className="v2-mono text-[var(--v2-faint)]">{label}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label} command`}
          className="text-[var(--v2-faint)] transition-colors hover:text-[var(--v2-fg)]"
        >
          {copied ? (
            <Check className="size-3.5 text-[var(--v2-ok)]" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
      <code className="block overflow-x-auto whitespace-nowrap px-4 py-3 font-mono text-[13px] text-[var(--v2-fg)]">
        <span className="select-none text-[var(--v2-faint)]">$ </span>
        {command}
      </code>
    </div>
  )
}

export function V2GettingStarted() {
  return (
    <section className="relative border-t border-[var(--v2-line)] bg-[var(--v2-bg-2)] py-20">
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <CornerMarks />
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
          <Reveal>
            <Eyebrow>Getting started</Eyebrow>
            <h2 className="v2-h mt-4 text-3xl sm:text-4xl">Run Durabull anywhere</h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--v2-muted)]">
              Start in the hosted cloud, self-host with Docker on your own network, or install the
              native desktop app. Your existing workers need{' '}
              <span className="font-medium text-[var(--v2-fg)]">zero code changes</span>.
            </p>
            <p className="mt-3 flex items-center gap-2 text-[13px] text-[var(--v2-faint)]">
              <Terminal className="size-3.5" />
              BullMQ v4+ · Apple Silicon macOS · Windows · Docker
            </p>
          </Reveal>
          <Reveal delay={0.12} className="space-y-3">
            <CommandBlock label="macOS (Homebrew)" command={HOMEBREW_INSTALL_COMMAND} />
            <CommandBlock
              label="Self-hosted (Docker)"
              command="docker run -p 3000:3000 durabullhq/durabull"
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ---------------- value cell grid ---------------- */

const cells = [
  {
    title: 'Zero integration tax',
    body: 'Durabull connects directly to Redis and reads BullMQ data structures. No SDK, no agent, no redeploy — your workers never know it exists.',
    meta: 'connect redis → see queues → fix failures',
  },
  {
    title: 'Built for on-call speed',
    body: 'Failed job → stack trace → logs → retry in one flow. Destructive operations are guarded with explicit queue-name confirmation.',
    meta: 'incident-first ux',
  },
  {
    title: 'Fleet-level intelligence',
    body: 'A health score, throughput trends, backlog pressure, and top risk queues across every queue on a connection — from BullMQ-native metrics.',
    meta: 'no separate metrics database',
  },
  {
    title: 'Alerts that find you',
    body: 'Failure thresholds, failure rates, and stalled-queue rules run in a background monitor. Routes to email, signed webhooks, and Linear.',
    meta: 'email · webhooks (hmac) · linear',
  },
  {
    title: 'Every environment, one org',
    body: 'Production, staging, and dev Redis connections side by side. DB-managed or env-driven for reproducible deploys.',
    meta: 'multi-connection',
  },
  {
    title: 'Your data stays yours',
    body: 'Encrypted connections. Job payloads stay in your Redis — Durabull reads queue metadata for display, never warehouses your data.',
    meta: 'privacy-conscious by design',
  },
]

export function V2ValueGrid() {
  return (
    <section id="features" className="relative scroll-mt-20 bg-[var(--v2-bg)] py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <Eyebrow>Why Durabull</Eyebrow>
          <h2 className="v2-h mt-4 max-w-2xl text-balance text-3xl leading-tight sm:text-4xl">
            Production queue operations, engineered properly.
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-12 grid gap-px border border-[var(--v2-line)] bg-[var(--v2-line)] sm:grid-cols-2 lg:grid-cols-3">
            {cells.map((cell) => (
              <div key={cell.title} className="v2-cell flex flex-col p-7">
                <h3 className="v2-h text-lg">{cell.title}</h3>
                <p className="mt-2.5 flex-1 text-[14px] leading-relaxed text-[var(--v2-muted)]">
                  {cell.body}
                </p>
                <p className="v2-mono mt-5 text-[var(--v2-faint)]">{cell.meta}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------------- problem → solution ---------------- */

const beforeRows = [
  ['03:12', 'payment-webhooks starts failing. Nobody notices.'],
  ['03:40', 'Backlog hits 40k. Retries hammer a flaky upstream.'],
  ['07:55', 'A customer emails: "Where is my invoice?"'],
  ['08:20', 'Someone SSHes in and runs KEYS bull:* in prod.'],
]

const afterRows = [
  ['03:12', 'Failure-rate alert fires → signed webhook → PagerDuty.'],
  ['03:14', 'On-call opens the failed job: stack trace, payload, attempts.'],
  ['03:19', 'Root cause found in logs. Bulk retry from the same screen.'],
  ['03:21', 'Linear issue auto-filed. Backlog drains. Back to bed.'],
]

export function V2Problem() {
  return (
    <section className="relative border-y border-[var(--v2-line)] bg-[var(--v2-bg-2)] py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <Eyebrow>The 3 a.m. problem</Eyebrow>
          <h2 className="v2-h mt-4 max-w-2xl text-balance text-3xl leading-tight sm:text-4xl">
            Background jobs are invisible — until they take you down.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {[
            {
              label: 'Without Durabull',
              rows: beforeRows,
              tone: 'var(--v2-bad)',
              footer: 'Time to resolution: 5+ hours. Tools: ssh, redis-cli, grep.',
            },
            {
              label: 'With Durabull',
              rows: afterRows,
              tone: 'var(--v2-ok)',
              footer: 'Time to resolution: 9 minutes. Tools: one browser tab.',
            },
          ].map((col, i) => (
            <Reveal key={col.label} delay={0.08 * (i + 1)}>
              <div className="v2-card h-full rounded-xl p-7">
                <p className="v2-mono" style={{ color: col.tone }}>
                  {col.label}
                </p>
                <ul className="mt-5 space-y-4">
                  {col.rows.map(([time, text]) => (
                    <li key={time} className="flex gap-4">
                      <span
                        className="shrink-0 pt-px font-mono text-[12px]"
                        style={{ color: col.tone }}
                      >
                        {time}
                      </span>
                      <span className="text-[14.5px] leading-relaxed text-[var(--v2-muted)]">
                        {text}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 border-t border-[var(--v2-line)] pt-4 font-mono text-[12px] text-[var(--v2-faint)]">
                  {col.footer}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
