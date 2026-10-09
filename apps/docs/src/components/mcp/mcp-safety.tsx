'use client'

import { Ban, Check, EyeOff, Fingerprint, Gauge, KeyRound, ScrollText } from 'lucide-react'
import { DurabullLogo } from '@/components/durabull-logo'
import { cn } from '@/lib/utils'
import { CornerMarks, Eyebrow, Reveal } from '../v2/reveal'

const readScopes = [
  ['mcp:discover', 'Server info and the tool catalog'],
  ['mcp:jobs:read', 'Queues, jobs, workers, schedulers'],
  ['mcp:logs:read', 'Job logs and stack traces'],
  ['mcp:failures:read', 'Alert rules and incidents'],
  ['mcp:diagnostics:read', 'Metrics, Redis health, triage'],
]

const writeScopes = [
  ['mcp:jobs:retry', 'Retry failed jobs'],
  ['mcp:jobs:promote', 'Promote delayed jobs'],
  ['mcp:queues:pause', 'Pause and resume queues'],
  ['mcp:failures:write', 'Acknowledge, resolve, snooze'],
]

const guarantees = [
  {
    icon: KeyRound,
    title: 'OAuth 2.1, per person',
    body: 'Each teammate signs in with their own Durabull login, using PKCE and tokens bound to the resource. Agents only see the connections that person can already open.',
  },
  {
    icon: Ban,
    title: 'Destructive actions can’t be granted',
    body: 'Delete, purge, obliterate, payload edits, and raw Redis commands have no scope, so no token can ever be granted them.',
  },
  {
    icon: EyeOff,
    title: 'Redacted at the source',
    body: 'Secrets, connection URLs, bearer tokens, JWTs, and API keys are removed from every response before the model sees it.',
  },
  {
    icon: ScrollText,
    title: 'Audit trail',
    body: 'Tool calls and resource reads are logged with the user, the tool, a hash of the input, and the result, including denials and rate limits. Logging is best-effort under heavy load.',
  },
  {
    icon: Gauge,
    title: 'Built for agent bursts',
    body: 'Separate rate budgets for reads, heavy diagnostics, and writes, per user and client, with Retry-After hints your agent can follow.',
  },
  {
    icon: Fingerprint,
    title: 'Treats your data as data',
    body: 'Server instructions tell the model to treat job names, payloads, logs, and alert text as untrusted input, never as instructions.',
  },
]

function ScopeRow({ scope, desc, write }: { scope: string; desc: string; write?: boolean }) {
  return (
    <li className="flex items-start gap-3 px-5 py-2.5">
      <span
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px] border',
          write
            ? 'border-[var(--v2-line-strong)] bg-[var(--v2-card)]'
            : 'border-[var(--v2-fg)] bg-[var(--v2-fg)] text-[var(--v2-bg)]'
        )}
      >
        {write ? null : <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-[12px] text-[var(--v2-fg)]">{scope}</span>
        <span className="block text-[12.5px] text-[var(--v2-muted)]">
          {desc}
          {write ? <span className="text-[var(--v2-accent)]"> (can make changes)</span> : null}
        </span>
      </span>
    </li>
  )
}

export function McpSafety() {
  return (
    <section id="security" className="relative scroll-mt-20 bg-[var(--v2-bg-2)] py-24 sm:py-32">
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <CornerMarks />
        <div className="grid items-center gap-14 lg:grid-cols-[1fr_0.9fr]">
          <Reveal>
            <Eyebrow>Your rules, enforced on the server</Eyebrow>
            <h2 className="v2-h mt-4 max-w-xl text-balance text-3xl leading-tight sm:text-5xl">
              Give your agent a key, not every key.
            </h2>
            <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-[var(--v2-muted)]">
              Read access is the default. Every write scope is opt-in on the consent screen, and
              each write tool checks the job or queue state before it changes anything.
            </p>
          </Reveal>

          {/* consent mock */}
          <Reveal delay={0.1}>
            <div className="v2-console mx-auto max-w-md overflow-hidden rounded-2xl">
              <div className="flex items-center gap-3 border-b border-[var(--v2-line)] px-5 py-4">
                <span className="grid size-9 place-items-center rounded-lg bg-[var(--v2-fg)] text-[var(--v2-bg)]">
                  <DurabullLogo className="size-5" />
                </span>
                <div>
                  <p className="text-[14px] font-semibold">Claude wants to access Durabull</p>
                  <p className="text-[12px] text-[var(--v2-faint)]">Signed in as you · Acme Inc.</p>
                </div>
              </div>
              <p className="v2-mono px-5 pb-1 pt-4 text-[var(--v2-faint)]">Read · default</p>
              <ul>
                {readScopes.map(([s, d]) => (
                  <ScopeRow key={s} scope={s} desc={d} />
                ))}
              </ul>
              <p className="v2-mono border-t border-[var(--v2-line)] px-5 pb-1 pt-4 text-[var(--v2-accent)]">
                Write · opt-in
              </p>
              <ul>
                {writeScopes.map(([s, d]) => (
                  <ScopeRow key={s} scope={s} desc={d} write />
                ))}
              </ul>
              <div className="mt-2 flex gap-2 border-t border-[var(--v2-line)] px-5 py-4">
                <span className="v2-btn-ghost flex-1 rounded-lg py-2 text-center text-[13px] font-medium">
                  Deny
                </span>
                <span className="v2-btn-primary flex-1 rounded-lg py-2 text-center text-[13px] font-semibold">
                  Allow
                </span>
              </div>
            </div>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-px border border-[var(--v2-line)] bg-[var(--v2-line)] sm:grid-cols-2 lg:grid-cols-3">
          {guarantees.map((g, i) => (
            <Reveal key={g.title} delay={i * 0.05} className="h-full">
              <div className="v2-cell h-full p-7">
                <span aria-hidden className="v2-cell-ticks" />
                <g.icon className="size-5 text-[var(--v2-accent)]" />
                <h3 className="v2-h mt-4 text-[17px]">{g.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--v2-muted)]">{g.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
