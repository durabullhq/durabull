import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
} from 'lucide-react'
import { memo, useCallback, useState } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface JsonViewerProps {
  data: unknown
  className?: string
  initialExpanded?: boolean
  maxInitialDepth?: number
  rootName?: string
  /** Label shown at the start of the header row (e.g. "Payload"). */
  title?: string
  /** Extra controls rendered in the header, before expand/copy. */
  actions?: React.ReactNode
  /** Classes for the scrolling body, e.g. a max height. */
  bodyClassName?: string
}

/**
 * Syntax palette, built from theme tokens so it holds in light and dark.
 * Keys stay ink; only values carry colour.
 */
const SYNTAX = {
  key: 'text-foreground',
  punctuation: 'text-faint',
  string: 'text-status-success',
  number: 'text-status-active',
  keyword: 'text-status-priority',
  meta: 'text-muted-foreground',
} as const

const ICON_BUTTON =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

function describe(data: unknown): string {
  if (data === null) return 'null'
  if (data === undefined) return 'undefined'
  if (Array.isArray(data))
    return `${data.length.toLocaleString()} ${data.length === 1 ? 'item' : 'items'}`
  if (typeof data === 'object') {
    const count = Object.keys(data as Record<string, unknown>).length
    return `${count.toLocaleString()} ${count === 1 ? 'key' : 'keys'}`
  }
  return typeof data
}

function hasNestedContent(data: unknown): boolean {
  if (data === null || typeof data !== 'object') return false
  return Object.values(data as Record<string, unknown>).some(
    (value) => value !== null && typeof value === 'object' && Object.keys(value).length > 0
  )
}

export function JsonViewer({
  data,
  className,
  initialExpanded = true,
  maxInitialDepth = 2,
  rootName,
  title,
  actions,
  bodyClassName,
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false)
  // `version` remounts the tree so every node re-reads its initial expansion.
  const [expansion, setExpansion] = useState<{ all: boolean | null; version: number }>({
    all: null,
    version: 0,
  })

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [data])

  const canToggleAll = hasNestedContent(data)
  const allExpanded = expansion.all === true
  const depth =
    expansion.all === null
      ? initialExpanded
        ? maxInitialDepth
        : 0
      : expansion.all
        ? Number.POSITIVE_INFINITY
        : 1

  return (
    <div className={cn('json-viewer overflow-hidden rounded-lg border bg-card', className)}>
      <div className="flex min-h-9 items-center gap-2 border-b bg-muted/50 py-1 pl-3 pr-1.5">
        {title ? <span className="text-[13px] font-medium text-foreground">{title}</span> : null}
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {describe(data)}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {actions}
          <TooltipProvider>
            {canToggleAll ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
                    onClick={() =>
                      setExpansion((previous) => ({
                        all: previous.all !== true,
                        version: previous.version + 1,
                      }))
                    }
                  >
                    {allExpanded ? (
                      <ChevronsDownUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{allExpanded ? 'Collapse all' : 'Expand all'}</TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={ICON_BUTTON}
                  aria-label="Copy JSON"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-status-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>{copied ? 'Copied!' : 'Copy JSON'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className={cn('overflow-auto px-2 py-2.5 font-mono text-xs leading-5', bodyClassName)}>
        <JsonNode
          key={expansion.version}
          data={data}
          depth={0}
          isLast={true}
          initialExpanded={depth > 0}
          maxInitialDepth={depth}
          keyName={rootName}
        />
      </div>
    </div>
  )
}

interface JsonNodeProps {
  data: unknown
  depth: number
  isLast: boolean
  keyName?: string
  initialExpanded?: boolean
  maxInitialDepth?: number
}

const INDENT = 14

function Key({ name }: { name?: string }) {
  if (name === undefined) return null
  return (
    <>
      <span className={SYNTAX.key}>"{name}"</span>
      <span className={SYNTAX.punctuation}>: </span>
    </>
  )
}

function Comma({ isLast }: { isLast: boolean }) {
  return isLast ? null : <span className={SYNTAX.punctuation}>,</span>
}

/** A leaf line: blank gutter (aligns with the chevron column) + key + value. */
function Leaf({
  depth,
  keyName,
  isLast,
  children,
}: {
  depth: number
  keyName?: string
  isLast: boolean
  children: React.ReactNode
}) {
  return (
    <span
      className="json-line block [overflow-wrap:anywhere]"
      style={{ paddingLeft: depth * INDENT + 16 }}
    >
      <Key name={keyName} />
      {children}
      <Comma isLast={isLast} />
    </span>
  )
}

/**
 * Memoized JSON node renderer
 * Prevents unnecessary re-renders when sibling nodes change
 */
const JsonNode = memo(function JsonNode({
  data,
  depth,
  isLast,
  keyName,
  initialExpanded = true,
  maxInitialDepth = 2,
}: JsonNodeProps) {
  const shouldExpandInitially = initialExpanded && depth < maxInitialDepth
  const [expanded, setExpanded] = useState(shouldExpandInitially)

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  if (data === null) {
    return (
      <Leaf depth={depth} keyName={keyName} isLast={isLast}>
        <span className={SYNTAX.keyword}>null</span>
      </Leaf>
    )
  }

  if (data === undefined) {
    return (
      <Leaf depth={depth} keyName={keyName} isLast={isLast}>
        <span className={cn(SYNTAX.meta, 'italic')}>undefined</span>
      </Leaf>
    )
  }

  if (typeof data !== 'object') {
    return (
      <Leaf depth={depth} keyName={keyName} isLast={isLast}>
        <PrimitiveValue value={data as string | number | boolean} />
      </Leaf>
    )
  }

  const isArray = Array.isArray(data)
  const entries: Array<[string | undefined, unknown]> = isArray
    ? (data as unknown[]).map((item) => [undefined, item])
    : Object.entries(data as Record<string, unknown>)
  const [open, close] = isArray ? ['[', ']'] : ['{', '}']

  if (entries.length === 0) {
    return (
      <Leaf depth={depth} keyName={keyName} isLast={isLast}>
        <span className={SYNTAX.punctuation}>
          {open}
          {close}
        </span>
      </Leaf>
    )
  }

  return (
    <div>
      {/* biome-ignore lint/a11y/useSemanticElements: Using span for inline JSON display styling */}
      <span
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className="json-line flex cursor-pointer items-start rounded-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
        style={{ paddingLeft: depth * INDENT }}
        onClick={toggleExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggleExpanded()
          }
        }}
      >
        <span className="inline-flex h-5 w-4 shrink-0 items-center justify-center text-faint">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </span>
        <span className="min-w-0 [overflow-wrap:anywhere]">
          <Key name={keyName} />
          <span className={SYNTAX.punctuation}>{open}</span>
          {!expanded && (
            <>
              <span className={cn(SYNTAX.meta, 'mx-1.5 text-[11px]')}>
                {entries.length.toLocaleString()}{' '}
                {isArray
                  ? entries.length === 1
                    ? 'item'
                    : 'items'
                  : entries.length === 1
                    ? 'key'
                    : 'keys'}
              </span>
              <span className={SYNTAX.punctuation}>{close}</span>
              <Comma isLast={isLast} />
            </>
          )}
        </span>
      </span>
      {expanded && (
        <>
          <div className="flex flex-col">
            {entries.map(([key, value], index) => (
              <JsonNode
                key={key ?? index}
                data={value}
                depth={depth + 1}
                isLast={index === entries.length - 1}
                keyName={key}
                initialExpanded={initialExpanded}
                maxInitialDepth={maxInitialDepth}
              />
            ))}
          </div>
          <span className="json-line block" style={{ paddingLeft: depth * INDENT + 16 }}>
            <span className={SYNTAX.punctuation}>{close}</span>
            <Comma isLast={isLast} />
          </span>
        </>
      )}
    </div>
  )
})

/**
 * Memoized primitive value renderer
 * Handles strings, numbers, and booleans with syntax highlighting
 */
const PrimitiveValue = memo(function PrimitiveValue({
  value,
}: {
  value: string | number | boolean
}) {
  if (typeof value === 'string') {
    const display = value.length > 200 ? `${value.slice(0, 200)}…` : value

    if (/^https?:\/\//.test(value)) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            SYNTAX.string,
            'underline decoration-dotted underline-offset-2 hover:decoration-solid'
          )}
          title="Open URL"
        >
          "{display}"
        </a>
      )
    }

    return <span className={SYNTAX.string}>"{display}"</span>
  }

  if (typeof value === 'number') {
    return <span className={SYNTAX.number}>{value}</span>
  }

  if (typeof value === 'boolean') {
    return <span className={SYNTAX.keyword}>{String(value)}</span>
  }

  return <span className={SYNTAX.key}>{String(value)}</span>
})

// Compact inline viewer for smaller displays
export function JsonViewerInline({ data, maxLength = 100 }: { data: unknown; maxLength?: number }) {
  const str = JSON.stringify(data)
  const truncated = str.length > maxLength

  return (
    <code className="rounded-[4px] border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
      {truncated ? `${str.slice(0, maxLength)}…` : str}
    </code>
  )
}
