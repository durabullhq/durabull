import { Database, Layers, ShieldCheck, Wrench } from 'lucide-react'
import { DurabullLogo } from '@/components/durabull-logo'
import { MCP_FACTS, MCP_HOST_PATH } from '@/lib/mcp-facts'
import { cn } from '@/lib/utils'
import { allHosts, featuredHosts, type Host, openHosts } from './hosts'

/* ---------------- hub diagram: agents → Durabull MCP → your queues ---------------- */

const W = 1100
const H = 480
const hubHosts = [
  allHosts.find((h) => h.name === 'Claude'),
  allHosts.find((h) => h.name === 'ChatGPT'),
  allHosts.find((h) => h.name === 'Cowork'),
  allHosts.find((h) => h.name === 'Cursor'),
  allHosts.find((h) => h.name === 'Muse'),
  allHosts.find((h) => h.name === 'Grok'),
].filter(Boolean) as Host[]

const leftY = hubHosts.map((_, i) => 40 + i * 80)
const rightItems = [
  { label: 'Production', sub: 'Redis · queues & jobs', y: 120 },
  { label: 'Staging', sub: 'Redis · queues & jobs', y: 240 },
  { label: 'Alerts & schedulers', sub: 'rules · incidents', y: 360 },
]

const pct = (v: number, total: number) => `${(v / total) * 100}%`

export function AgentHub() {
  return (
    <>
      {/* desktop: wired diagram */}
      <div
        className="relative mx-auto hidden w-full max-w-6xl lg:block"
        style={{ aspectRatio: `${W}/${H}` }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full">
          <title>Agents connect through Durabull MCP to your BullMQ queues</title>
          {leftY.map((y, i) => {
            const d = `M230 ${y} C 330 ${y}, 320 240, 420 240`
            return (
              <g key={`l${y}`}>
                <path d={d} className="v2-wire" />
                <path
                  d={d}
                  pathLength={100}
                  className="v2-wire-flow"
                  style={{ animationDelay: `${i * -0.45}s` }}
                />
                <path
                  d={d}
                  pathLength={100}
                  className="v2-wire-flow v2-wire-flow-rev"
                  style={{ animationDelay: `${i * -0.7 - 1.2}s` }}
                />
              </g>
            )
          })}
          {rightItems.map(({ y }, i) => {
            const d = `M680 240 C 780 240, 770 ${y}, 870 ${y}`
            return (
              <g key={`r${y}`}>
                <path d={d} className="v2-wire" />
                <path
                  d={d}
                  pathLength={100}
                  className="v2-wire-flow"
                  style={{ animationDelay: `${i * -0.9}s` }}
                />
              </g>
            )
          })}
        </svg>

        {hubHosts.map((h, i) => (
          <div
            key={h.name}
            className="v2-host absolute flex items-center gap-3 rounded-xl px-4"
            style={{
              left: 0,
              width: pct(230, W),
              top: pct(leftY[i] - 28, H),
              height: pct(56, H),
            }}
          >
            <h.Mark className="size-6 shrink-0 text-[var(--v2-fg)]" />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-[var(--v2-fg)]">
                {h.name}
              </span>
              <span className="block truncate text-[11px] text-[var(--v2-faint)]">
                {openHosts.includes(h) ? `${h.maker} · remote MCP` : h.maker}
              </span>
            </span>
          </div>
        ))}

        {/* core */}
        <div
          className="absolute grid place-items-center"
          style={{ left: pct(420, W), width: pct(260, W), top: pct(110, H), height: pct(260, H) }}
        >
          <div aria-hidden className="v2-hub-ring absolute inset-[-14%] rounded-full" />
          <div className="v2-hub-core relative flex size-full flex-col items-center justify-center rounded-3xl px-5 text-center">
            <DurabullLogo className="size-12 text-[#f97316]" />
            <p className="v2-h mt-3 text-[19px] text-[#fafaf9]">Durabull MCP</p>
            <p className="mt-1 font-mono text-[11px] text-[#a8a29e]">{MCP_HOST_PATH}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {['OAuth 2.1', `${MCP_FACTS.tools} tools`, 'MCP Apps', 'Audit'].map((t) => (
                <span
                  key={t}
                  className="rounded-md border border-[rgba(249,115,22,0.35)] px-1.5 py-0.5 font-mono text-[10px] text-[#fdba74]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {rightItems.map((r) => (
          <div
            key={r.label}
            className="v2-host absolute flex items-center gap-3 rounded-xl px-4"
            style={{
              left: pct(870, W),
              width: pct(230, W),
              top: pct(r.y - 34, H),
              height: pct(68, H),
            }}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--v2-accent-soft)] text-[var(--v2-accent)]">
              <Database className="size-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-[var(--v2-fg)]">
                {r.label}
              </span>
              <span className="block truncate font-mono text-[11px] text-[var(--v2-faint)]">
                {r.sub}
              </span>
            </span>
          </div>
        ))}

        <p className="v2-mono absolute left-0 top-[-34px] text-[var(--v2-faint)]">Your agents</p>
        <p
          className="v2-mono absolute top-[-34px] text-center text-[var(--v2-faint)]"
          style={{ left: pct(420, W), width: pct(260, W) }}
        >
          Scoped · redacted · audited
        </p>
        <p className="v2-mono absolute right-0 top-[-34px] text-[var(--v2-faint)]">
          Your BullMQ fleet
        </p>
      </div>

      {/* mobile: stacked flow */}
      <div className="mx-auto max-w-md space-y-3 lg:hidden">
        <div className="grid grid-cols-3 gap-2">
          {hubHosts.map((h) => (
            <div
              key={h.name}
              className="v2-host flex flex-col items-center gap-1.5 rounded-xl py-3"
            >
              <h.Mark className="size-6 text-[var(--v2-fg)]" />
              <span className="text-[12px] font-medium">{h.name}</span>
            </div>
          ))}
        </div>
        <div
          aria-hidden
          className="mx-auto h-8 w-px bg-gradient-to-b from-[var(--v2-line-strong)] to-[var(--v2-accent)]"
        />
        <div className="v2-hub-core flex items-center gap-4 rounded-2xl px-5 py-4">
          <DurabullLogo className="size-10 shrink-0 text-[#f97316]" />
          <div>
            <p className="v2-h text-[17px] text-[#fafaf9]">Durabull MCP</p>
            <p className="font-mono text-[11px] text-[#a8a29e]">
              OAuth 2.1 · {MCP_FACTS.tools} tools · MCP Apps
            </p>
          </div>
        </div>
        <div
          aria-hidden
          className="mx-auto h-8 w-px bg-gradient-to-b from-[var(--v2-accent)] to-[var(--v2-line-strong)]"
        />
        <div className="grid grid-cols-3 gap-2">
          {rightItems.map((r) => (
            <div key={r.label} className="v2-host rounded-xl px-3 py-3 text-center">
              <Database className="mx-auto size-4 text-[var(--v2-accent)]" />
              <span className="mt-1.5 block text-[12px] font-medium">{r.label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/* ---------------- host logo grid ---------------- */

function HostTile({ host, featured }: { host: Host; featured?: boolean }) {
  return (
    <div className={cn('v2-host flex h-full flex-col rounded-2xl p-5', featured && 'sm:p-6')}>
      <host.Mark className={cn('text-[var(--v2-fg)]', featured ? 'size-9' : 'size-7')} />
      <p
        className={cn(
          'v2-h text-[var(--v2-fg)]',
          featured ? 'mt-6 text-[19px]' : 'mt-5 text-[16px]'
        )}
      >
        {host.name}
      </p>
      <p className="mt-0.5 text-[12px] text-[var(--v2-faint)]">by {host.maker}</p>
      <p
        className={cn(
          'v2-mono mt-auto pt-4',
          featured ? 'text-[var(--v2-accent)]' : 'text-[var(--v2-faint)]'
        )}
      >
        {host.surface}
      </p>
    </div>
  )
}

export function HostGrid() {
  return (
    <div className="space-y-4">
      <p className="v2-mono text-[var(--v2-faint)]">Documented setup</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {featuredHosts.map((h) => (
          <HostTile key={h.name} host={h} featured />
        ))}
      </div>
      <p className="v2-mono pt-4 text-[var(--v2-faint)]">
        Any remote MCP client · not yet tested by Durabull
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {openHosts.map((h) => (
          <HostTile key={h.name} host={h} />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-3 text-[12.5px] text-[var(--v2-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <Layers className="size-3.5 text-[var(--v2-accent)]" /> Interactive app where MCP Apps are
          supported
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Wrench className="size-3.5 text-[var(--v2-accent)]" /> Text tools everywhere else
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-[var(--v2-accent)]" /> Same OAuth, scopes, and audit
          in every client
        </span>
      </div>
    </div>
  )
}
