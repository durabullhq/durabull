'use client'

import { Check, Copy, CornerDownLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { DurabullLogo } from '@/components/durabull-logo'
import { MCP_URL } from '@/lib/mcp-facts'
import { cn } from '@/lib/utils'

/* ---------------- clipboard ---------------- */

/** Copies text and flags `copied` briefly; the reset timer is cleared on re-copy and unmount. */
export function useCopy(resetMs = 1800) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), resetMs)
    } catch {
      /* clipboard unavailable */
    }
  }

  return { copied, copy }
}

/* ---------------- copyable MCP server URL ---------------- */

export function McpUrl({
  className,
  label = 'MCP server URL',
}: {
  className?: string
  label?: string
}) {
  const { copied, copy } = useCopy()

  return (
    <div className={cn('inline-flex max-w-full flex-col items-start gap-2', className)}>
      {label ? <span className="v2-mono text-[var(--v2-faint)]">{label}</span> : null}
      <div className="flex max-w-full items-center gap-1 rounded-xl border border-[var(--v2-line-strong)] bg-[var(--v2-card)] p-1 pl-4 shadow-[0_1px_2px_rgba(12,12,12,0.05)]">
        <code className="min-w-0 truncate font-mono text-[13.5px] text-[var(--v2-fg)]">
          {MCP_URL}
        </code>
        <button
          type="button"
          onClick={() => copy(MCP_URL)}
          aria-label="Copy MCP server URL"
          className="v2-btn-primary ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
        >
          {copied ? <Check className="v2-pop size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/* ---------------- tool name pill ---------------- */

export function ToolPill({ name, write }: { name: string; write?: boolean }) {
  return (
    <span className="v2-tool-pill inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[var(--v2-muted)]">
      <span
        aria-hidden
        className="inline-block size-1.5 rounded-full"
        style={{ background: write ? 'var(--v2-accent)' : 'var(--v2-ok)' }}
      />
      {name}
    </span>
  )
}

/* ---------------- agent conversation pieces ---------------- */

export function AgentFrame({
  children,
  title = 'Your agent',
  badge = 'Example',
  className,
  footer = true,
}: {
  children: ReactNode
  title?: ReactNode
  badge?: ReactNode
  className?: string
  footer?: boolean
}) {
  return (
    <div className={cn('v2-console overflow-hidden rounded-2xl', className)}>
      <div className="flex items-center justify-between border-b border-[var(--v2-line)] px-4 py-2.5">
        <span className="flex items-center gap-2 text-[12.5px] font-medium text-[var(--v2-fg)]">
          <span className="v2-pulse-dot inline-block size-1.5 rounded-full bg-[var(--v2-ok)] text-[var(--v2-ok)]" />
          {title}
        </span>
        <span className="rounded-md border border-[var(--v2-line)] px-2 py-0.5 text-[10.5px] text-[var(--v2-faint)]">
          {badge}
        </span>
      </div>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
      {footer ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="flex items-center justify-between rounded-xl border border-[var(--v2-line)] bg-[var(--v2-bg-2)] py-2 pl-4 pr-2 text-[13px] text-[var(--v2-faint)]">
            Ask your agent
            <span className="grid size-7 place-items-center rounded-full bg-[var(--v2-fg)] text-[var(--v2-bg)]">
              <CornerDownLeft className="size-3.5" />
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function UserMsg({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <p className="v2-bubble-user max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed">
        {children}
      </p>
    </div>
  )
}

export function UsedDurabull({ tools }: { tools?: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--v2-accent-soft)] px-2 py-1 text-[11.5px] font-medium text-[var(--v2-accent)]">
        <DurabullLogo className="size-3.5" />
        Used Durabull
      </span>
      {tools?.map((t) => (
        <span key={t} className="v2-toolcall rounded-md px-1.5 py-0.5 text-[var(--v2-faint)]">
          {t}
        </span>
      ))}
    </div>
  )
}

export function AgentMsg({ children }: { children: ReactNode }) {
  return (
    <p className="v2-bubble-agent max-w-[92%] rounded-2xl rounded-tl-md px-4 py-2.5 text-[14px] leading-relaxed text-[var(--v2-fg)]">
      {children}
    </p>
  )
}

/* ---------------- compact result card ---------------- */

export function ResultCard({
  title,
  status,
  tone = 'neutral',
  rows,
  children,
}: {
  title: string
  status?: string
  tone?: 'neutral' | 'ok' | 'bad' | 'accent'
  rows?: [string, ReactNode][]
  children?: ReactNode
}) {
  const toneClass = {
    neutral: 'bg-[var(--v2-bg-2)] text-[var(--v2-muted)]',
    ok: 'bg-[rgba(21,128,61,0.1)] text-[var(--v2-ok)]',
    bad: 'bg-[rgba(220,38,38,0.1)] text-[var(--v2-bad)]',
    accent: 'bg-[var(--v2-accent-soft)] text-[var(--v2-accent)]',
  }[tone]

  return (
    <div className="max-w-[92%] overflow-hidden rounded-xl border border-[var(--v2-line)] bg-[var(--v2-card)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--v2-line)] px-4 py-2.5">
        <span className="truncate font-mono text-[12.5px] font-medium text-[var(--v2-fg)]">
          {title}
        </span>
        {status ? (
          <span
            className={cn('shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium', toneClass)}
          >
            {status}
          </span>
        ) : null}
      </div>
      {rows ? (
        <dl className="divide-y divide-[var(--v2-line)]">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between gap-4 px-4 py-2 text-[12.5px]"
            >
              <dt className="text-[var(--v2-faint)]">{k}</dt>
              <dd className="text-right font-medium text-[var(--v2-fg)]">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </div>
  )
}
