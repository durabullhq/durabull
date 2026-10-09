import { Alert } from '@openai/apps-sdk-ui/components/Alert'
import { Badge } from '@openai/apps-sdk-ui/components/Badge'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage'
import {
  Chat,
  ChevronLeft,
  ChevronRight,
  Search,
  TriangleExclamationErrorWarning,
} from '@openai/apps-sdk-ui/components/Icon'
import { Input } from '@openai/apps-sdk-ui/components/Input'
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip'
import { createContext, type ReactNode, useContext, useState } from 'react'
import type { Explorer, ExplorerState } from './explorer'
import { type Data, json, short, str, text, title } from './format'
import type { ToolName } from './views/registry'

type Ctx = {
  explorer: Explorer
  state: ExplorerState
  /** Identifiers carried from the current snapshot into drill-down reads. */
  ids: Data
  /** Connection navigation, rendered under the card header when a connection is in scope. */
  nav: ReactNode
}
const ExplorerContext = createContext<Ctx | null>(null)
export const ExplorerProvider = ExplorerContext.Provider
export function useExplorer() {
  const context = useContext(ExplorerContext)
  if (!context) throw new Error('Explorer context missing')
  const { explorer, state, ids, nav } = context
  return {
    state,
    ids,
    nav,
    disabled: !state.connected || state.busy !== false,
    open: (tool: ToolName, args: Data) => void explorer.load(tool, args),
    back: explorer.back,
    ask: explorer.canAsk ? (action: string, args: Data) => void explorer.ask(action, args) : null,
  }
}

/** Card heading modeled on native assistant cards: context line, title, supporting line. */
export function Header({
  eyebrow,
  heading,
  subtitle,
  badge,
}: {
  eyebrow: string
  heading: string
  subtitle?: ReactNode
  badge?: ReactNode
}) {
  const { state, back, nav } = useExplorer()
  return (
    <>
      <header className="flex items-start gap-2">
        {state.depth > 0 ? (
          <Button
            color="secondary"
            variant="ghost"
            size="sm"
            uniform
            aria-label="Back"
            className="-ms-1.5 mt-0.5"
            disabled={state.busy === 'ask'}
            onClick={back}
          >
            <ChevronLeft />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-secondary text-sm">{eyebrow}</p>
          <h1 className="heading-lg mt-0.5 break-words outline-none">{heading}</h1>
          {subtitle ? <p className="text-secondary mt-0.5 text-sm">{subtitle}</p> : null}
        </div>
        {badge ? <div className="flex shrink-0 items-center gap-2">{badge}</div> : null}
      </header>
      {nav}
    </>
  )
}

/** Horizontally scrolling row of small pill controls that bleeds to the card edge. */
export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]"
    >
      {children}
    </nav>
  )
}

export type Tone = 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'discovery'
const TONES: Record<string, Tone> = {
  failed: 'danger',
  firing: 'danger',
  error: 'danger',
  rejected: 'danger',
  production: 'discovery',
  active: 'success',
  completed: 'success',
  resolved: 'success',
  delivered: 'success',
  sent: 'success',
  confirmed: 'success',
  high: 'success',
  waiting: 'info',
  'waiting-children': 'info',
  prioritized: 'info',
  delayed: 'warning',
  paused: 'warning',
  snoozed: 'warning',
  pending: 'warning',
  retrying: 'warning',
  acknowledged: 'warning',
  medium: 'warning',
}
const TONE_TEXT: Record<Tone, string> = {
  secondary: '',
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
  discovery: 'text-discovery',
}
export const toneOf = (status: unknown): Tone => TONES[str(status).toLowerCase()] ?? 'secondary'
/** Status pill using the design system's semantic colors. */
export function StatusBadge({ status, label }: { status: unknown; label?: string }) {
  return (
    <Badge color={toneOf(status)} className="shrink-0">
      {label ?? (title(str(status)) || 'Unknown')}
    </Badge>
  )
}

export type Stat = { label: string; value: unknown; tone?: Tone; display?: string }
/** Headline metrics in soft tiles; counts shorten beyond 10k with the exact value on hover. */
export function Stats({ items }: { items: Stat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 min-[440px]:grid-cols-4">
      {items.map(({ label, value, tone, display }) => {
        const shown = display ?? short(value)
        const exact = typeof value === 'number' ? value.toLocaleString() : shown
        return (
          <div key={label} className="bg-surface-secondary rounded-xl px-3 py-2.5">
            <dt className="text-secondary truncate text-xs">{label}</dt>
            <dd
              className={`mt-0.5 text-lg font-semibold tabular-nums ${tone ? TONE_TEXT[tone] : ''}`}
            >
              {display !== undefined || exact === shown ? (
                shown
              ) : (
                <Tooltip content={exact} compact>
                  <span>{shown}</span>
                </Tooltip>
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/** Divided card section with a small heading and optional trailing control. */
export function Section({
  heading,
  trailing,
  children,
}: {
  heading: string
  trailing?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-subtle border-t pt-4">
      <div className="mb-2 flex min-h-7 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{heading}</h2>
        {trailing}
      </div>
      {children}
    </section>
  )
}

/** Values this long may truncate in a narrow card, so the full text shows on hover. */
const LONG_FACT = 28
/** Label/value pairs aligned like native receipt cards. Values are rendered as text only. */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  const visible = items.filter(([, value]) => value !== undefined)
  return (
    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      {visible.map(([label, value]) => {
        const content =
          value === null || value === '' ? '—' : typeof value === 'object' ? value : text(value)
        return (
          <div key={label} className="contents">
            <dt className="text-secondary">{label}</dt>
            <dd className="truncate text-end tabular-nums">
              {typeof content === 'string' && content.length > LONG_FACT ? (
                <Tooltip content={content} maxWidth={320}>
                  <span>{content}</span>
                </Tooltip>
              ) : (
                content
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/**
 * Whole-row navigation. Only the title is the accessible button name; the stretched
 * hit area keeps metadata readable without bloating screen reader labels.
 */
export function Row({
  label,
  meta,
  detail,
  trailing,
  icon,
  onOpen,
}: {
  label: string
  meta?: ReactNode
  detail?: ReactNode
  trailing?: ReactNode
  icon?: ReactNode
  onOpen?: () => void
}) {
  const { disabled } = useExplorer()
  return (
    <li className="hover:bg-surface-secondary relative -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors">
      {icon ? <span className="text-secondary shrink-0 [&>svg]:size-5">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        {onOpen ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onOpen}
            className="block max-w-full truncate text-start font-medium after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[var(--color-ring)] disabled:cursor-default"
          >
            {label}
          </button>
        ) : (
          <p className="truncate font-medium">{label}</p>
        )}
        {meta ? <p className="text-secondary truncate text-sm">{meta}</p> : null}
        {detail}
      </div>
      {trailing ? (
        <div className="text-secondary flex shrink-0 items-center gap-2 text-sm">{trailing}</div>
      ) : null}
      {onOpen ? <ChevronRight className="text-tertiary size-4 shrink-0" /> : null}
    </li>
  )
}
export function Rows({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col">{children}</ul>
}

/** Native disclosure for redacted payloads and configuration. */
export function Payload({
  label,
  value,
  defaultOpen = false,
}: {
  label: string
  value: unknown
  defaultOpen?: boolean
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="text-secondary hover:text-default flex cursor-pointer list-none items-center gap-1 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
        {label}
      </summary>
      <Code className="mt-2">{json(value)}</Code>
    </details>
  )
}
export function Code({ children, className = '' }: { children: string; className?: string }) {
  return (
    <pre
      className={`bg-surface-secondary max-h-80 overflow-auto rounded-xl p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap ${className}`}
    >
      {children}
    </pre>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-tertiary text-xs leading-relaxed">{children}</p>
}
export function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="bg-surface-secondary flex items-start gap-2 rounded-xl p-3 text-sm">
      <TriangleExclamationErrorWarning className="text-warning mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function Empty({ heading, children }: { heading: string; children?: ReactNode }) {
  return (
    <EmptyMessage fill="none" className="py-6">
      <EmptyMessage.Title>{heading}</EmptyMessage.Title>
      {children ? <EmptyMessage.Description>{children}</EmptyMessage.Description> : null}
    </EmptyMessage>
  )
}

/** Drill-down that reads through the bridge's read-only allowlist. */
export function Go({
  label,
  tool,
  args,
  variant = 'secondary',
}: {
  label: string
  tool: ToolName
  args: Data
  variant?: 'primary' | 'secondary'
}) {
  const { open, disabled } = useExplorer()
  return (
    <Button
      color={variant}
      variant={variant === 'primary' ? 'solid' : 'soft'}
      size="sm"
      disabled={disabled}
      onClick={() => open(tool, args)}
    >
      {label}
    </Button>
  )
}

/** Assistant-mediated operation; hidden when the host cannot send user messages. */
export function Ask({ label, action, ids }: { label: string; action: string; ids: Data }) {
  const { ask, disabled } = useExplorer()
  if (!ask) return null
  return (
    <Button
      color="secondary"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => ask(action, ids)}
    >
      <Chat />
      {label}
    </Button>
  )
}
export function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2 empty:hidden">{children}</div>
}

/** Client-side filter for the current page only; it never queries the server. */
export function useFilter(items: Data[]) {
  const [query, setQuery] = useState('')
  const filtered = query
    ? items.filter((item) => JSON.stringify(item).toLowerCase().includes(query.toLowerCase()))
    : items
  const input = (
    <Input
      size="sm"
      variant="soft"
      type="search"
      placeholder="Filter this page"
      aria-label="Filter current page"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      startAdornment={<Search className="text-tertiary size-4" />}
    />
  )
  return { filtered, input }
}

/** Confirms a write the assistant performed; the card below is the post-operation snapshot. */
export function Receipt({ heading }: { heading: string }) {
  return (
    <Alert
      color="success"
      variant="soft"
      title={heading}
      description="Snapshot taken right after the operation."
    />
  )
}

/** Live error (Alert gives danger role=alert) that also offers to retry the exact failed read. */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert
      color="danger"
      variant="soft"
      description={message}
      actions={
        onRetry ? (
          <Button color="danger" variant="soft" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    />
  )
}
