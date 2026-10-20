import { ArrowRight, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { WEB_APP_URL } from '@/lib/config'
import { MCP_FACTS } from '@/lib/mcp-facts'
import type { Competitor, SourceLink } from '@/lib/compare/types'

export function McpBand() {
  return (
    <aside className="border border-[var(--v2-line)] bg-[var(--v2-bg-2)] px-5 py-6 sm:px-7">
      <p className="v2-mono text-[var(--v2-accent)]">Durabull MCP</p>
      <p className="v2-h mt-2 text-xl sm:text-2xl">
        The headline difference: operate BullMQ from the agent.
      </p>
      <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[var(--v2-muted)]">
        {MCP_FACTS.tools} tools for Claude, ChatGPT, Cursor, and any MCP client. Inspect queues,
        explain failures, retry or promote jobs, pause a queue, and manage alerts. Write scopes are
        opt-in. Destructive Redis commands are not exposed.
      </p>
      <Link
        href="/mcp"
        className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--v2-fg)] underline decoration-[var(--v2-line-strong)] underline-offset-4 hover:decoration-[var(--v2-accent)]"
      >
        Durabull MCP
        <ArrowRight aria-hidden className="size-4 text-[var(--v2-accent)]" />
      </Link>
    </aside>
  )
}

export function CompareCta() {
  return (
    <section className="border-t border-[var(--v2-line)] bg-[var(--v2-bg-2)]">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center sm:px-8">
        <div>
          <h2 className="v2-h text-xl">Connect Redis. Queues appear.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--v2-muted)]">
            Hosted Durabull is free to start. Then connect your agent at /mcp.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`${WEB_APP_URL}/signup`}
            className="v2-btn-primary inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold"
          >
            Start Free
            <ArrowUpRight className="size-4" />
          </Link>
          <Link
            href="/mcp"
            className="v2-btn-ghost inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-medium"
          >
            Connect your agent
          </Link>
        </div>
      </div>
    </section>
  )
}

export function SourceList({ sources }: { sources: SourceLink[] }) {
  return (
    <ul className="space-y-2 text-sm leading-6">
      {sources.map((source) => (
        <li key={source.url}>
          <a
            href={source.url}
            className="inline-flex items-start gap-2 text-[var(--v2-fg)] underline decoration-[var(--v2-line-strong)] underline-offset-4 hover:decoration-[var(--v2-accent)]"
          >
            {source.label}
            <ArrowUpRight
              aria-hidden
              className="mt-0.5 size-3.5 shrink-0 text-[var(--v2-accent)]"
            />
          </a>
        </li>
      ))}
    </ul>
  )
}

export function RelatedLinks({ items }: { items: Competitor[] }) {
  if (items.length === 0) return null
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.slug}>
          <Link
            href={`/compare/${item.slug}`}
            className="group flex h-full flex-col border border-[var(--v2-line)] px-4 py-4 transition-colors hover:border-[var(--v2-line-strong)]"
          >
            <span className="v2-mono text-[var(--v2-faint)]">Durabull vs</span>
            <span className="v2-h mt-1 text-lg group-hover:text-[var(--v2-accent)]">
              {item.name}
            </span>
            <span className="mt-2 text-[13px] leading-6 text-[var(--v2-muted)]">
              {item.oneLiner}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function SectionIntro({
  label,
  title,
  children,
}: {
  label?: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="mb-8 max-w-2xl">
      {label ? <p className="v2-mono text-[var(--v2-accent)]">{label}</p> : null}
      <h2 className="v2-h mt-2 text-2xl sm:text-3xl">{title}</h2>
      {children ? (
        <div className="mt-3 text-[15px] leading-7 text-[var(--v2-muted)]">{children}</div>
      ) : null}
    </div>
  )
}
