'use client'

import { ArrowRight, Layers, MessageSquareText, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { MCP_FACTS } from '@/lib/mcp-facts'
import { AgentHub, HostGrid } from '../mcp/agent-hub'
import { TrademarkNote } from '../mcp/hosts'
import { McpUrl } from '../mcp/primitives'
import { QueueExplorer } from '../mcp/queue-explorer'
import { EmberField } from './ember-field'
import { Reveal } from './reveal'

const pillars = [
  {
    icon: MessageSquareText,
    title: 'Ask in plain language',
    body: `${MCP_FACTS.tools} MCP tools cover queues, jobs, logs, schedulers, workers, alerts, and Redis health. Your agent picks the right ones.`,
  },
  {
    icon: Layers,
    title: 'See it, not just read it',
    body: 'In Claude, Cowork, and ChatGPT, answers arrive as Queue Explorer, an interactive Durabull app inside the conversation.',
  },
  {
    icon: ShieldCheck,
    title: 'Act with your approval',
    body: 'Read access is the default. Retry, promote, pause, and alert actions are separate opt-in scopes, and calls are audit-logged.',
  },
]

/** Home-page section: Durabull MCP and the agents it plugs into. */
export function V2Agents() {
  return (
    <section
      id="agents"
      className="v2-dark relative scroll-mt-20 overflow-hidden bg-[var(--v2-bg)] py-24 sm:py-32"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(50% 45% at 50% 0%, rgba(249,115,22,0.18), transparent 70%), radial-gradient(35% 40% at 0% 70%, rgba(234,88,12,0.08), transparent 70%)',
        }}
      />
      <div aria-hidden className="v2-blueprint v2-blueprint-fade absolute inset-0" />
      <EmberField count={24} intensity={0.8} spread={1} />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <Link
            href="/mcp"
            className="v2-chip v2-mono inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[var(--v2-accent)] transition-colors hover:text-[var(--v2-fg)]"
          >
            <span className="rounded-full bg-[var(--v2-accent)] px-1.5 py-px text-[9.5px] text-white">
              New
            </span>
            Durabull MCP
            <ArrowRight className="size-3.5" />
          </Link>
          <h2 className="v2-h mt-6 text-balance text-4xl leading-[1.04] text-[var(--v2-fg)] sm:text-6xl">
            Your queues,
            <br />
            <span className="text-[var(--v2-accent)]">inside every agent.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-[16px] leading-relaxed text-[var(--v2-muted)] sm:text-[17px]">
            Durabull MCP gives Claude, ChatGPT, Cowork, Cursor and any MCP client scoped access to
            your BullMQ fleet. Ask what broke, see the evidence, and approve the fix without leaving
            the chat.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mt-20">
          <AgentHub />
        </Reveal>

        <div className="mt-20 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div className="space-y-8">
            {pillars.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.08}>
                <div className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--v2-line-strong)] bg-[var(--v2-card)] text-[var(--v2-accent)]">
                    <p.icon className="size-4.5" />
                  </span>
                  <div>
                    <h3 className="v2-h text-[18px] text-[var(--v2-fg)]">{p.title}</h3>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--v2-muted)]">
                      {p.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
            <Reveal delay={0.24} className="flex flex-col items-start gap-5 pt-2">
              <McpUrl />
              <Link
                href="/mcp"
                className="v2-btn-accent inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[15px] font-semibold"
              >
                Explore Durabull MCP
                <ArrowRight className="size-4" />
              </Link>
            </Reveal>
          </div>
          <Reveal delay={0.12}>
            <div className="v2-frame overflow-hidden rounded-2xl">
              <QueueExplorer initialView="overview" theme="dark" />
            </div>
            <p className="mt-3 text-center text-[11.5px] text-[var(--v2-faint)]">
              Queue Explorer MCP App, shown with fixture data. Click the tabs.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.1} className="mt-24">
          <p className="v2-mono mb-6 text-center text-[var(--v2-faint)]">
            Works with the agents your team already uses
          </p>
          <HostGrid />
        </Reveal>

        <TrademarkNote className="mx-auto mt-10 max-w-2xl text-center" />
      </div>
    </section>
  )
}
