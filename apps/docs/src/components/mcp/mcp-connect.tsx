'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, Copy, Server } from 'lucide-react'
import type { ComponentType } from 'react'
import { useId, useState } from 'react'
import { MCP_FACTS, MCP_URL } from '@/lib/mcp-facts'
import { cn } from '@/lib/utils'
import { Eyebrow, Reveal } from '../v2/reveal'
import { ClaudeCodeMark, ClaudeMark, CursorMark, OpenAIMark } from './brand-marks'
import { McpUrl, useCopy } from './primitives'

const steps = [
  {
    n: '1',
    title: 'Add the Durabull connector',
    body: 'In your agent’s settings, add a custom connector or remote MCP server with this URL.',
  },
  {
    n: '2',
    title: 'Sign in and choose access',
    body: 'Your agent opens a Durabull sign-in page. Approve the read scopes, and any write scopes you want.',
  },
  {
    n: '3',
    title: 'Ask for what you need',
    body: 'Try “Show my Durabull connections” or “What failed in production in the last hour?”',
  },
]

interface Guide {
  id: string
  label: string
  Mark: ComponentType<{ className?: string }>
  lines: string[]
  code?: { label: string; text: string }[]
  note?: string
}

const guides: Guide[] = [
  {
    id: 'claude',
    label: 'Claude & Cowork',
    Mark: ClaudeMark,
    lines: [
      'Open Settings → Connectors and add a custom connector.',
      'Paste the Durabull MCP URL and sign in to Durabull.',
      'Queue Explorer renders inline in Claude and Cowork conversations.',
    ],
    code: [{ label: 'Connector URL', text: MCP_URL }],
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT & Codex',
    Mark: OpenAIMark,
    lines: [
      'In ChatGPT, open Plugins → Add custom MCP server.',
      'Paste the URL and complete the browser sign-in.',
      `For the ${MCP_FACTS.skills} skills, add the Durabull plugin package to a local marketplace and install it from the Plugins Directory. In Codex, the inline app depends on the host; the text tools always work.`,
    ],
    code: [{ label: 'MCP server URL', text: MCP_URL }],
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    Mark: ClaudeCodeMark,
    lines: [
      `Install the Durabull plugin from the repository marketplace. It includes the MCP server and ${MCP_FACTS.skills} skills.`,
    ],
    code: [
      { label: 'Add the marketplace', text: '/plugin marketplace add durabullhq/durabull' },
      { label: 'Install the plugin', text: '/plugin install durabull@durabull' },
    ],
    note: 'Claude Code is text-only, so you get the tools and skills without the inline app.',
  },
  {
    id: 'other',
    label: 'Cursor & any MCP client',
    Mark: CursorMark,
    lines: [
      'Any client that supports remote MCP over Streamable HTTP with OAuth can connect.',
      'Add Durabull to your client’s MCP config, then sign in when prompted.',
    ],
    code: [
      {
        label: 'mcp.json',
        text: `{\n  "mcpServers": {\n    "durabull": { "url": "${MCP_URL}" }\n  }\n}`,
      },
    ],
  },
]

function CodeBlock({ label, text }: { label: string; text: string }) {
  const { copied, copy } = useCopy(1600)
  return (
    <div className="v2-cmd v2-dark rounded-lg">
      <div className="flex items-center justify-between border-b border-[var(--v2-line)] px-4 py-2">
        <span className="v2-mono text-[var(--v2-faint)]">{label}</span>
        <button
          type="button"
          onClick={() => copy(text)}
          aria-label={`Copy ${label}`}
          className="text-[var(--v2-faint)] transition-colors hover:text-[var(--v2-fg)]"
        >
          {copied ? (
            <Check className="v2-pop size-3.5 text-[var(--v2-ok)]" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-[var(--v2-fg)]">
        {text}
      </pre>
    </div>
  )
}

export function McpConnect() {
  const [active, setActive] = useState(0)
  const reduceMotion = useReducedMotion()
  const guide = guides[active]
  const tabsId = useId()

  return (
    <section id="connect" className="relative scroll-mt-20 bg-[var(--v2-bg)] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="text-center">
          <div className="flex justify-center">
            <Eyebrow>Connect</Eyebrow>
          </div>
          <h2 className="v2-h mt-4 text-balance text-3xl leading-tight sm:text-5xl">
            Connect in three steps.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15.5px] leading-relaxed text-[var(--v2-muted)]">
            You need a Durabull account. Each teammate connects their own agent with their own
            login.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-[var(--v2-line)] bg-[var(--v2-line)] md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08} className="h-full min-w-0">
              <div className="h-full bg-[var(--v2-card)] p-7 sm:p-8">
                <span className="v2-h grid size-9 place-items-center rounded-full bg-[var(--v2-fg)] text-[15px] text-[var(--v2-bg)]">
                  {s.n}
                </span>
                <h3 className="v2-h mt-5 text-[19px]">{s.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--v2-muted)]">
                  {s.body}
                </p>
                {s.n === '1' ? <McpUrl className="mt-5" label="" /> : null}
              </div>
            </Reveal>
          ))}
        </div>

        {/* per-host guides */}
        <Reveal delay={0.1} className="mt-10">
          <div className="overflow-hidden rounded-2xl border border-[var(--v2-line)] bg-[var(--v2-bg-2)]">
            <div
              className="flex overflow-x-auto border-b border-[var(--v2-line)]"
              role="tablist"
              aria-label="Setup guide by agent"
            >
              {guides.map((g, i) => (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  id={`${tabsId}-tab-${g.id}`}
                  aria-selected={active === i}
                  aria-controls={`${tabsId}-panel`}
                  onClick={() => setActive(i)}
                  className={cn(
                    'relative flex shrink-0 items-center gap-2 px-5 py-4 text-[13.5px] font-medium transition-colors',
                    active === i
                      ? 'bg-[var(--v2-card)] text-[var(--v2-fg)]'
                      : 'text-[var(--v2-faint)] hover:text-[var(--v2-muted)]'
                  )}
                >
                  <g.Mark className="size-4 text-[var(--v2-fg)]" />
                  {g.label}
                  {active === i ? (
                    <span className="absolute inset-x-0 bottom-[-1px] h-0.5 bg-[var(--v2-accent)]" />
                  ) : null}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={guide.id}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.22 }}
                id={`${tabsId}-panel`}
                role="tabpanel"
                aria-labelledby={`${tabsId}-tab-${guide.id}`}
                className="grid gap-8 bg-[var(--v2-card)] p-7 sm:p-9 lg:grid-cols-2"
              >
                <ol className="space-y-4">
                  {guide.lines.map((line, i) => (
                    <li
                      key={line}
                      className="flex gap-3 text-[14.5px] leading-relaxed text-[var(--v2-muted)]"
                    >
                      <span className="v2-mono mt-1 shrink-0 text-[var(--v2-accent)]">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {line}
                    </li>
                  ))}
                  {guide.note ? (
                    <li className="rounded-lg border border-[var(--v2-line)] bg-[var(--v2-bg-2)] px-4 py-3 text-[13px] text-[var(--v2-muted)]">
                      {guide.note}
                    </li>
                  ) : null}
                </ol>
                <div className="space-y-3">
                  {guide.code?.map((c) => (
                    <CodeBlock key={c.label} label={c.label} text={c.text} />
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          <p className="mt-5 flex items-start justify-center gap-2 text-center text-[13px] text-[var(--v2-faint)]">
            <Server className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Self-hosting? The same server runs at <code className="font-mono">/mcp</code> on your
              own Durabull URL, e.g.{' '}
              <code className="font-mono">https://queues.example.com/mcp</code>.
            </span>
          </p>
        </Reveal>
      </div>
    </section>
  )
}
