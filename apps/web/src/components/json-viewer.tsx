import { Braces, Brackets, Check, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { memo, useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface JsonViewerProps {
  data: unknown
  className?: string
  initialExpanded?: boolean
  maxInitialDepth?: number
  rootName?: string
}

export function JsonViewer({
  data,
  className,
  initialExpanded = true,
  maxInitialDepth = 2,
  rootName,
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [data])

  return (
    <div className={cn('relative group', className)}>
      {/* Copy button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-status-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? 'Copied!' : 'Copy JSON'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* JSON content */}
      <div className="json-viewer rounded-lg bg-[#0d1117] p-4 overflow-auto font-mono text-sm border border-[#30363d]">
        <JsonNode
          data={data}
          depth={0}
          isLast={true}
          initialExpanded={initialExpanded}
          maxInitialDepth={maxInitialDepth}
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

  const indent = depth * 16

  // Handle null
  if (data === null) {
    return (
      <span className="json-line" style={{ paddingLeft: indent }}>
        {keyName !== undefined && (
          <>
            <span className="text-[#7ee787]">"{keyName}"</span>
            <span className="text-[#c9d1d9]">: </span>
          </>
        )}
        <span className="text-[#79c0ff] font-medium">null</span>
        {!isLast && <span className="text-[#c9d1d9]">,</span>}
      </span>
    )
  }

  // Handle undefined
  if (data === undefined) {
    return (
      <span className="json-line" style={{ paddingLeft: indent }}>
        {keyName !== undefined && (
          <>
            <span className="text-[#7ee787]">"{keyName}"</span>
            <span className="text-[#c9d1d9]">: </span>
          </>
        )}
        <span className="text-[#8b949e] italic">undefined</span>
        {!isLast && <span className="text-[#c9d1d9]">,</span>}
      </span>
    )
  }

  // Handle primitives
  if (typeof data !== 'object') {
    return (
      <span className="json-line" style={{ paddingLeft: indent }}>
        {keyName !== undefined && (
          <>
            <span className="text-[#7ee787]">"{keyName}"</span>
            <span className="text-[#c9d1d9]">: </span>
          </>
        )}
        <PrimitiveValue value={data as string | number | boolean} />
        {!isLast && <span className="text-[#c9d1d9]">,</span>}
      </span>
    )
  }

  // Handle arrays
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return (
        <span className="json-line" style={{ paddingLeft: indent }}>
          {keyName !== undefined && (
            <>
              <span className="text-[#7ee787]">"{keyName}"</span>
              <span className="text-[#c9d1d9]">: </span>
            </>
          )}
          <span className="text-[#c9d1d9]">[]</span>
          {!isLast && <span className="text-[#c9d1d9]">,</span>}
        </span>
      )
    }

    return (
      <div>
        {/* biome-ignore lint/a11y/useSemanticElements: Using span for inline JSON display styling */}
        <span
          role="button"
          tabIndex={0}
          className="json-line cursor-pointer hover:bg-[#161b22] rounded inline-flex items-center"
          style={{ paddingLeft: indent }}
          onClick={toggleExpanded}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleExpanded()
            }
          }}
        >
          <span className="w-4 h-4 inline-flex items-center justify-center mr-1 text-[#8b949e]">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
          {keyName !== undefined && (
            <>
              <span className="text-[#7ee787]">"{keyName}"</span>
              <span className="text-[#c9d1d9]">: </span>
            </>
          )}
          <Brackets className="h-3 w-3 text-[#f0883e] mr-1" />
          <span className="text-[#c9d1d9]">[</span>
          {!expanded && (
            <>
              <span className="text-[#8b949e] mx-1 text-xs">{data.length} items</span>
              <span className="text-[#c9d1d9]">]</span>
              {!isLast && <span className="text-[#c9d1d9]">,</span>}
            </>
          )}
        </span>
        {expanded && (
          <>
            <div className="flex flex-col">
              {data.map((item, index) => (
                <JsonNode
                  key={index}
                  data={item}
                  depth={depth + 1}
                  isLast={index === data.length - 1}
                  initialExpanded={initialExpanded}
                  maxInitialDepth={maxInitialDepth}
                />
              ))}
            </div>
            <span className="json-line" style={{ paddingLeft: indent }}>
              <span className="w-4 h-4 inline-block" />
              <span className="text-[#c9d1d9]">]</span>
              {!isLast && <span className="text-[#c9d1d9]">,</span>}
            </span>
          </>
        )}
      </div>
    )
  }

  // Handle objects
  const entries = Object.entries(data as Record<string, unknown>)
  if (entries.length === 0) {
    return (
      <span className="json-line" style={{ paddingLeft: indent }}>
        {keyName !== undefined && (
          <>
            <span className="text-[#7ee787]">"{keyName}"</span>
            <span className="text-[#c9d1d9]">: </span>
          </>
        )}
        <span className="text-[#c9d1d9]">{'{}'}</span>
        {!isLast && <span className="text-[#c9d1d9]">,</span>}
      </span>
    )
  }

  return (
    <div>
      {/* biome-ignore lint/a11y/useSemanticElements: Using span for inline JSON display styling */}
      <span
        role="button"
        tabIndex={0}
        className="json-line cursor-pointer hover:bg-[#161b22] rounded inline-flex items-center"
        style={{ paddingLeft: indent }}
        onClick={toggleExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggleExpanded()
          }
        }}
      >
        <span className="w-4 h-4 inline-flex items-center justify-center mr-1 text-[#8b949e]">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </span>
        {keyName !== undefined && (
          <>
            <span className="text-[#7ee787]">"{keyName}"</span>
            <span className="text-[#c9d1d9]">: </span>
          </>
        )}
        <Braces className="h-3 w-3 text-[#a371f7] mr-1" />
        <span className="text-[#c9d1d9]">{'{'}</span>
        {!expanded && (
          <>
            <span className="text-[#8b949e] mx-1 text-xs">{entries.length} keys</span>
            <span className="text-[#c9d1d9]">{'}'}</span>
            {!isLast && <span className="text-[#c9d1d9]">,</span>}
          </>
        )}
      </span>
      {expanded && (
        <>
          <div className="flex flex-col">
            {entries.map(([key, value], index) => (
              <JsonNode
                key={key}
                data={value}
                depth={depth + 1}
                isLast={index === entries.length - 1}
                keyName={key}
                initialExpanded={initialExpanded}
                maxInitialDepth={maxInitialDepth}
              />
            ))}
          </div>
          <span className="json-line" style={{ paddingLeft: indent }}>
            <span className="w-4 h-4 inline-block" />
            <span className="text-[#c9d1d9]">{'}'}</span>
            {!isLast && <span className="text-[#c9d1d9]">,</span>}
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
    // Check if it's a URL
    const isUrl = /^https?:\/\//.test(value)
    // Check if it looks like a date
    const isDate = /^\d{4}-\d{2}-\d{2}T/.test(value)
    // Check if it looks like an error message
    const isError = /error|exception|failed|invalid/i.test(value) && value.length > 20

    if (isUrl) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'text-[#a5d6ff]',
            'underline decoration-dotted cursor-pointer hover:text-[#79c0ff]'
          )}
          title="Click to open URL"
        >
          "{value.length > 200 ? `${value.slice(0, 200)}…` : value}"
        </a>
      )
    }

    return (
      <span
        className={cn('text-[#a5d6ff]', isDate && 'text-[#d2a8ff]', isError && 'text-[#ff7b72]')}
      >
        "{value.length > 200 ? `${value.slice(0, 200)}…` : value}"
      </span>
    )
  }

  if (typeof value === 'number') {
    return <span className="text-[#79c0ff]">{value}</span>
  }

  if (typeof value === 'boolean') {
    return <span className={value ? 'text-[#7ee787]' : 'text-[#ff7b72]'}>{String(value)}</span>
  }

  return <span className="text-[#c9d1d9]">{String(value)}</span>
})

// Compact inline viewer for smaller displays
export function JsonViewerInline({ data, maxLength = 100 }: { data: unknown; maxLength?: number }) {
  const str = JSON.stringify(data)
  const truncated = str.length > maxLength

  return (
    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
      {truncated ? `${str.slice(0, maxLength)}…` : str}
    </code>
  )
}
