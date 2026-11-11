import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SEGMENTED_GROUP_CLASS, segmentedItemClass } from '@/components/ui/tabs'
import type { QueueFilterMode } from '@/hooks/use-alerts'
import { cn } from '@/lib/utils'

interface QueueMultiSelectProps {
  availableQueues: string[]
  selectedQueueNames: string[]
  onSelectedQueueNamesChange: (queueNames: string[]) => void
  queueFilterMode: QueueFilterMode
  onQueueFilterModeChange: (mode: QueueFilterMode) => void
}

export function QueueMultiSelect({
  availableQueues,
  selectedQueueNames,
  onSelectedQueueNamesChange,
  queueFilterMode,
  onQueueFilterModeChange,
}: QueueMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const filteredQueues = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return availableQueues

    return availableQueues.filter((queueName) => queueName.toLowerCase().includes(normalizedQuery))
  }, [availableQueues, query])

  const summaryLabel = useMemo(() => {
    if (selectedQueueNames.length === 0) {
      return queueFilterMode === 'exclude' ? 'No queues excluded' : 'Select queue names'
    }
    if (selectedQueueNames.length === 1) return selectedQueueNames[0]
    return `${selectedQueueNames.length} queues selected`
  }, [queueFilterMode, selectedQueueNames])

  const toggleQueue = (queueName: string) => {
    if (selectedQueueNames.includes(queueName)) {
      onSelectedQueueNamesChange(selectedQueueNames.filter((current) => current !== queueName))
      return
    }

    onSelectedQueueNamesChange(
      [...selectedQueueNames, queueName].sort((left, right) => left.localeCompare(right))
    )
  }

  const helperText =
    queueFilterMode === 'exclude'
      ? 'Select queues to exclude. The rule fires for all other discovered queues.'
      : 'Select the queues this rule should watch.'

  return (
    <div className="space-y-3" ref={containerRef}>
      <div className={SEGMENTED_GROUP_CLASS}>
        <button
          type="button"
          aria-pressed={queueFilterMode === 'include'}
          className={segmentedItemClass(queueFilterMode === 'include')}
          onClick={() => {
            if (queueFilterMode !== 'include') {
              onQueueFilterModeChange('include')
              onSelectedQueueNamesChange([])
            }
          }}
        >
          Select only
        </button>
        <button
          type="button"
          aria-pressed={queueFilterMode === 'exclude'}
          className={segmentedItemClass(queueFilterMode === 'exclude')}
          onClick={() => {
            if (queueFilterMode !== 'exclude') {
              onQueueFilterModeChange('exclude')
              onSelectedQueueNamesChange([])
            }
          }}
        >
          All except
        </button>
      </div>

      <div className="relative">
        <button
          type="button"
          className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-card px-2.5 text-left text-[13px] shadow-xs transition-colors hover:border-border-strong focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
          onClick={() => setOpen((current) => !current)}
        >
          <span className="truncate">{summaryLabel}</span>
          <ChevronDown className="ml-3 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>

        {open ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-20 overflow-hidden rounded-lg border bg-popover shadow-lg">
            <div className="border-b p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search queue names"
                  className="pl-8"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{helperText}</p>
            </div>

            <div className="max-h-72 overflow-auto p-2">
              {filteredQueues.length > 0 ? (
                filteredQueues.map((queueName) => {
                  const isSelected = selectedQueueNames.includes(queueName)

                  return (
                    <button
                      key={queueName}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                        isSelected && 'bg-accent'
                      )}
                      onClick={() => toggleQueue(queueName)}
                    >
                      <span className="truncate">{queueName}</span>
                      {isSelected ? <Check className="h-4 w-4 text-foreground" /> : null}
                    </button>
                  )
                })
              ) : (
                <div className="px-3 py-8 text-center text-[13px] text-muted-foreground">
                  No queues match "{query.trim()}".
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {queueFilterMode === 'exclude' && selectedQueueNames.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
          No queues excluded — this rule watches every discovered queue on the connection.
        </div>
      ) : null}

      {selectedQueueNames.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {selectedQueueNames.map((queueName) => (
              <Badge key={queueName} variant="outline" className="gap-1 bg-card">
                {queueName}
                <button
                  type="button"
                  className="ml-1 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() =>
                    onSelectedQueueNamesChange(
                      selectedQueueNames.filter((current) => current !== queueName)
                    )
                  }
                  aria-label={`Remove ${queueName}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>

          {selectedQueueNames.length > 1 ? (
            <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-3 text-sm">
              <span className="text-muted-foreground">
                {queueFilterMode === 'exclude'
                  ? `${selectedQueueNames.length} queues excluded from this rule.`
                  : `${selectedQueueNames.length} queues selected.`}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onSelectedQueueNamesChange([])}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {queueFilterMode === 'include' && availableQueues.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
          No queues are currently indexed for this connection yet. You can switch to "all except"
          mode to watch all future queues, or return after discovery finishes.
        </div>
      ) : null}
    </div>
  )
}
