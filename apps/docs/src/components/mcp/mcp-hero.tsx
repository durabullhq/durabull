'use client'

import { motion } from 'framer-motion'
import { ArrowDown, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { WEB_APP_URL } from '@/lib/config'
import { MCP_FACTS } from '@/lib/mcp-facts'
import { cn } from '@/lib/utils'
import { HeroGridShimmer } from '../v2/hero-grid-shimmer'
import { Reveal, useHeroFadeUp } from '../v2/reveal'
import { AgentDemo } from './agent-demo'
import { HostRow } from './hosts'
import { McpUrl } from './primitives'

export function McpHero() {
  const fadeUp = useHeroFadeUp()

  return (
    <section className="relative overflow-hidden bg-[var(--v2-bg)] pb-24 pt-36 sm:pt-44">
      <div aria-hidden className="v2-blueprint v2-blueprint-fade absolute inset-0" />
      <div aria-hidden className="v2-aurora absolute inset-0" />
      <HeroGridShimmer />

      <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-8">
        <motion.div {...fadeUp(0)}>
          <span className="v2-chip v2-mono inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[var(--v2-muted)]">
            <span className="v2-pulse-dot inline-block size-1.5 rounded-full bg-[var(--v2-accent)] text-[var(--v2-accent)]" />
            Durabull MCP · OAuth 2.1 · MCP Apps
          </span>
        </motion.div>

        <motion.h1
          {...fadeUp(0.1)}
          className="v2-h mt-8 text-balance text-[clamp(2.6rem,6vw,4.6rem)] leading-[1.02]"
        >
          Operate BullMQ
          <br />
          from <span className="text-[var(--v2-accent)]">your agent.</span>
        </motion.h1>

        <motion.p
          {...fadeUp(0.2)}
          className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-[var(--v2-muted)] sm:text-lg"
        >
          Durabull MCP connects Claude, ChatGPT, Codex and any MCP client to your queues. Ask
          what&apos;s failing, get the evidence, and approve the fix without leaving the chat.
        </motion.p>

        <motion.div {...fadeUp(0.3)} className="mt-9 flex justify-center">
          <McpUrl />
        </motion.div>

        <motion.div
          {...fadeUp(0.38)}
          className="mt-6 flex flex-wrap items-center justify-center gap-3.5"
        >
          <a
            href="#connect"
            className="v2-btn-primary inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[15px] font-semibold"
          >
            <ArrowDown className="size-4" />
            How to connect
          </a>
          <Link
            href={`${WEB_APP_URL}/signup`}
            className="v2-btn-ghost inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[15px] font-medium"
          >
            Create a free account
            <ArrowRight className="size-4" />
          </Link>
        </motion.div>

        <motion.div {...fadeUp(0.46)} className="mt-12">
          <p className="v2-mono text-[var(--v2-faint)]">Works where your team already works</p>
          <HostRow className="mx-auto mt-5 max-w-3xl" />
        </motion.div>
      </div>

      <div className="relative mt-16 px-5 sm:px-8">
        <Reveal y={40}>
          <AgentDemo />
        </Reveal>
      </div>
    </section>
  )
}

const stats = [
  {
    value: String(MCP_FACTS.tools),
    label: 'MCP tools',
    note: `${MCP_FACTS.readTools} read · ${MCP_FACTS.writeTools} write`,
  },
  { value: String(MCP_FACTS.scopes), label: 'OAuth scopes', note: 'writes never auto-granted' },
  { value: '~20', label: 'App views', note: 'in one Queue Explorer' },
  { value: String(MCP_FACTS.skills), label: 'Agent skills', note: 'Claude Code · Codex · ChatGPT' },
]

export function McpStats() {
  return (
    <section className="border-y border-[var(--v2-line)] bg-[var(--v2-bg-2)]">
      <div className="mx-auto grid max-w-7xl grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal
            key={s.label}
            delay={i * 0.06}
            className={cn(
              'border-[var(--v2-line)] px-6 py-10 sm:px-10',
              i % 2 === 1 && 'border-l',
              i >= 2 && 'border-t lg:border-t-0',
              i >= 1 && 'lg:border-l'
            )}
          >
            <p className="v2-h text-[44px] leading-none text-[var(--v2-fg)] sm:text-[56px]">
              {s.value}
            </p>
            <p className="mt-3 text-[14px] font-semibold text-[var(--v2-fg)]">{s.label}</p>
            <p className="v2-mono mt-1 text-[var(--v2-faint)]">{s.note}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
