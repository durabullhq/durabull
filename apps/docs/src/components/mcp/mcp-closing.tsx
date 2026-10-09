'use client'

import { ArrowRight, Check, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { WEB_APP_URL } from '@/lib/config'
import { MCP_FACTS } from '@/lib/mcp-facts'
import { mcpFaqs } from '@/lib/mcp-faqs'
import { EmberField } from '../v2/ember-field'
import { FaqItem } from '../v2/faq'
import { Eyebrow, Reveal } from '../v2/reveal'
import { AgentHub, HostGrid } from './agent-hub'
import { TrademarkNote } from './hosts'
import { McpUrl } from './primitives'

/* ---------------- works with ---------------- */

const prompts = [
  ['triage_failed_jobs', 'Group recent failures by root cause and recommend next steps.'],
  ['investigate_queue_backlog', 'Check workers, throughput, drain time, and Redis pressure.'],
  ['alert_activity_review', 'Open incidents, noisy rules, and delivery failures.'],
  ['connection_health_check', 'A healthy / degraded / unhealthy / unknown verdict, read-only.'],
]

export function McpWorksWith() {
  return (
    <section
      id="hosts"
      className="relative scroll-mt-20 overflow-hidden bg-[var(--v2-bg)] py-24 sm:py-32"
    >
      <div aria-hidden className="v2-aurora absolute inset-0" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <div className="flex justify-center">
            <Eyebrow>Works with</Eyebrow>
          </div>
          <h2 className="v2-h mt-4 text-balance text-3xl leading-tight sm:text-5xl">
            The agents your team already uses.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-[15.5px] leading-relaxed text-[var(--v2-muted)]">
            Durabull MCP follows the open Model Context Protocol. Claude, ChatGPT, and Cowork get
            the interactive app, Claude Code and Codex get a plugin with skills, and any other MCP
            client can connect with the same URL.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mt-20">
          <AgentHub />
        </Reveal>

        <Reveal delay={0.1} className="mt-20">
          <HostGrid />
        </Reveal>

        {/* prompts & skills */}
        <Reveal delay={0.1} className="mt-16">
          <div className="grid gap-8 rounded-3xl border border-[var(--v2-line)] bg-[var(--v2-bg-2)] p-7 sm:p-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="v2-mono flex items-center gap-2 text-[var(--v2-accent)]">
                <Sparkles className="size-3.5" /> Built-in workflows
              </p>
              <h3 className="v2-h mt-3 text-2xl sm:text-[28px]">
                {MCP_FACTS.prompts} prompts and {MCP_FACTS.skills} skills included.
              </h3>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--v2-muted)]">
                Prompts give any client a one-click starting point. The plugin adds{' '}
                {MCP_FACTS.skills} skills for setup, fleet health, queue triage, job inspection,
                schedules, Redis health, alert triage, job recovery, and queue control.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {prompts.map(([name, desc]) => (
                <li
                  key={name}
                  className="rounded-xl border border-[var(--v2-line)] bg-[var(--v2-card)] p-4"
                >
                  <p className="font-mono text-[12.5px] font-medium text-[var(--v2-fg)]">/{name}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--v2-muted)]">
                    {desc}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <TrademarkNote className="mx-auto mt-10 max-w-2xl text-center" />
      </div>
    </section>
  )
}

/* ---------------- FAQ ---------------- */

export function McpFaq() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section
      id="faq"
      className="relative scroll-mt-20 border-t border-[var(--v2-line)] bg-[var(--v2-bg-2)] py-24"
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="v2-h mt-4 text-3xl leading-tight sm:text-4xl">
            Frequently asked questions
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-[var(--v2-muted)]">
            More detail is in the{' '}
            <Link
              href="/documentation/integrations/mcp-server"
              className="underline underline-offset-4"
            >
              MCP server docs
            </Link>
            .
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="border-t border-[var(--v2-line)]">
            {mcpFaqs.map((f, i) => (
              <FaqItem
                key={f.question}
                question={f.question}
                answer={f.answer}
                open={open === i}
                onToggle={() => setOpen((curr) => (curr === i ? null : i))}
              />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------------- final CTA ---------------- */

export function McpFinalCta() {
  return (
    <section className="v2-dark relative overflow-hidden bg-[var(--v2-bg)] py-28 sm:py-36">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(55% 80% at 50% 100%, rgba(249,115,22,0.18) 0%, transparent 60%)',
        }}
      />
      <EmberField />
      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <Reveal>
          <p className="v2-mono text-[var(--v2-accent)]">The future of ops is agentic</p>
          <h2 className="v2-h mt-5 text-balance text-4xl leading-tight text-[var(--v2-fg)] sm:text-6xl">
            Bring Durabull into your agent.
          </h2>
          <ul className="mx-auto mt-8 flex max-w-3xl flex-col items-center gap-2.5 whitespace-nowrap text-[15px] text-[var(--v2-muted)] sm:flex-row sm:justify-center sm:gap-6">
            {[
              'Triage from a chat',
              'Act with your approval',
              'Same login and access as the web app',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="size-4 text-[var(--v2-accent)]" /> {t}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.12}>
          <div className="mt-10 flex justify-center">
            <McpUrl />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3.5">
            <Link
              href={`${WEB_APP_URL}/signup`}
              className="v2-btn-accent inline-flex items-center gap-2 rounded-lg px-7 py-3.5 text-[15px] font-semibold"
            >
              Create a free account
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/documentation/integrations/mcp-server"
              className="v2-btn-ghost inline-flex items-center gap-2 rounded-lg px-7 py-3.5 text-[15px] font-medium"
            >
              Read the MCP docs
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
