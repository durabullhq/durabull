'use client'

import { motion, useInView, useReducedMotion } from 'framer-motion'
import { Check, Copy, Terminal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HOMEBREW_INSTALL_COMMAND, MAC_VERIFY_DOWNLOAD_COMMAND } from '@/lib/config'
import { CornerMarks, Eyebrow, Reveal } from './reveal'

/* ---------------- getting started / install ---------------- */

/**
 * Shell syntax highlighting for the first `upTo` characters of a command:
 * command name green, flags accent orange, arguments light.
 */
function CommandTokens({ command, upTo }: { command: string; upTo: number }) {
  const tokens = command.split(/(\s+)/)
  const parts: React.ReactNode[] = []
  let consumed = 0
  let seenCommand = false

  for (let i = 0; i < tokens.length && consumed < upTo; i++) {
    const token = tokens[i]
    const visible = token.slice(0, upTo - consumed)
    consumed += token.length
    if (!visible) continue

    if (/^\s+$/.test(token)) {
      parts.push(visible)
      continue
    }

    let className = 'text-[var(--v2-fg)]'
    if (!seenCommand) {
      className = 'text-[var(--v2-ok)]'
      seenCommand = true
    } else if (token.startsWith('-')) {
      className = 'text-[var(--v2-accent)]'
    }
    parts.push(
      <span key={i} className={className}>
        {visible}
      </span>,
    )
  }

  return <>{parts}</>
}

function CommandBlock({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false)
  const reduceMotion = useReducedMotion()
  const codeRef = useRef<HTMLElement>(null)
  const inView = useInView(codeRef, { once: true, margin: '-80px' })
  const [typed, setTyped] = useState(0)

  const done = reduceMotion || typed >= command.length

  // biome-ignore lint/correctness/useExhaustiveDependencies: `typed` re-arms the timeout after every character, driving the typing loop
  useEffect(() => {
    if (!inView || done) return
    const tick = setTimeout(() => setTyped((n) => n + 1), 22)
    return () => clearTimeout(tick)
  }, [inView, done, typed])

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
    <div className="v2-cmd v2-dark rounded-lg">
      <div className="flex items-center justify-between border-b border-[var(--v2-line)] px-4 py-2">
        <span className="v2-mono text-[var(--v2-faint)]">{label}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label} command`}
          className="text-[var(--v2-faint)] transition-colors hover:text-[var(--v2-fg)]"
        >
          {copied ? (
            <Check className="v2-pop size-3.5 text-[var(--v2-ok)]" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
      <code
        ref={codeRef}
        className="block overflow-x-auto whitespace-nowrap px-4 py-3 font-mono text-[13px]"
      >
        <span className="select-none text-[var(--v2-faint)]">$ </span>
        <CommandTokens command={command} upTo={done ? command.length : typed} />
        <span aria-hidden className="v2-caret" />
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
            <CommandBlock label="Verify macOS DMG" command={MAC_VERIFY_DOWNLOAD_COMMAND} />
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
                <span aria-hidden className="v2-cell-ticks" />
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

/** Incident rows replay like a live log when the column scrolls into view. */
function TimelineColumn({
  label,
  rows,
  tone,
  footer,
  resolved,
  startDelay,
}: {
  label: string
  rows: string[][]
  tone: string
  footer: string
  resolved?: boolean
  startDelay: number
}) {
  const reduceMotion = useReducedMotion()
  // each row lands 0.45s after the previous; footer arrives after the last row
  const footerDelay = startDelay + rows.length * 0.45 + 0.3

  const staticBody = (
    <>
      <ul className="mt-5 space-y-4">
        {rows.map(([time, text]) => (
          <li key={time} className="flex gap-4">
            <span className="shrink-0 pt-px font-mono text-[12px]" style={{ color: tone }}>
              {time}
            </span>
            <span className="text-[14.5px] leading-relaxed text-[var(--v2-muted)]">{text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 flex items-center gap-2 border-t border-[var(--v2-line)] pt-4 font-mono text-[12px] text-[var(--v2-faint)]">
        {resolved ? (
          <span
            aria-hidden
            className="v2-pulse-dot inline-block size-1.5 shrink-0 rounded-full"
            style={{ color: tone, background: tone }}
          />
        ) : null}
        {footer}
      </p>
    </>
  )

  return (
    <div className="v2-card h-full rounded-xl p-7">
      <p className="v2-mono" style={{ color: tone }}>
        {label}
      </p>
      {reduceMotion ? (
        staticBody
      ) : (
        <>
          <motion.ul
            className="mt-5 space-y-4"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-100px' }}
            transition={{ staggerChildren: 0.45, delayChildren: startDelay }}
          >
            {rows.map(([time, text]) => (
              <motion.li
                key={time}
                className="flex gap-4"
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
                }}
              >
                <motion.span
                  className="shrink-0 pt-px font-mono text-[12px]"
                  style={{ color: tone }}
                  variants={{
                    hidden: { opacity: 0 },
                    // terminal-style flicker as the timestamp lands
                    show: { opacity: [0, 1, 0.25, 1], transition: { duration: 0.4, times: [0, 0.3, 0.6, 1] } },
                  }}
                >
                  {time}
                </motion.span>
                <span className="text-[14.5px] leading-relaxed text-[var(--v2-muted)]">{text}</span>
              </motion.li>
            ))}
          </motion.ul>
          <motion.p
            className="mt-6 flex items-center gap-2 border-t border-[var(--v2-line)] pt-4 font-mono text-[12px] text-[var(--v2-faint)]"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.5, delay: footerDelay }}
          >
            {resolved ? (
              <motion.span
                aria-hidden
                className="v2-pulse-dot inline-block size-1.5 shrink-0 rounded-full"
                style={{ color: tone, background: tone }}
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ delay: footerDelay, type: 'spring', stiffness: 400, damping: 16 }}
              />
            ) : null}
            {footer}
          </motion.p>
        </>
      )}
    </div>
  )
}

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
          <Reveal delay={0.08}>
            <TimelineColumn
              label="Without Durabull"
              rows={beforeRows}
              tone="var(--v2-bad)"
              footer="Time to resolution: 5+ hours. Tools: ssh, redis-cli, grep."
              startDelay={0.3}
            />
          </Reveal>
          <Reveal delay={0.16}>
            <TimelineColumn
              label="With Durabull"
              rows={afterRows}
              tone="var(--v2-ok)"
              footer="Time to resolution: 9 minutes. Tools: one browser tab."
              resolved
              startDelay={0.5}
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
