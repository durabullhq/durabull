import { Check, ChevronDown, Link2, Mail, Search, Webhook, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { AlertDestinationType, AlertRuleDestinationSummary } from '@/hooks/use-alerts'
import { cn } from '@/lib/utils'

const TYPE_ORDER: AlertDestinationType[] = ['webhook', 'email', 'linear']

const TYPE_META: Record<
  AlertDestinationType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  webhook: { label: 'Webhooks', icon: Webhook },
  email: { label: 'Email', icon: Mail },
  linear: { label: 'Linear', icon: Link2 },
}

interface DestinationMultiSelectProps {
  destinations: AlertRuleDestinationSummary[]
  selectedDestinationIds: string[]
  onSelectedDestinationIdsChange: (destinationIds: string[]) => void
  isLoading?: boolean
}

/** Checkbox-list popover of saved org destinations, grouped by type. */
export function DestinationMultiSelect({
  destinations,
  selectedDestinationIds,
  onSelectedDestinationIdsChange,
  isLoading = false,
}: DestinationMultiSelectProps) {
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const showSearch = destinations.length > 8

  const filteredDestinations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return destinations

    return destinations.filter((destination) =>
      destination.name.toLowerCase().includes(normalizedQuery)
    )
  }, [destinations, query])

  const groups = useMemo(
    () =>
      TYPE_ORDER.map((type) => ({
        type,
        destinations: filteredDestinations.filter((destination) => destination.type === type),
      })).filter((group) => group.destinations.length > 0),
    [filteredDestinations]
  )

  const selectedDestinations = destinations.filter((destination) =>
    selectedDestinationIds.includes(destination.id)
  )

  const summaryLabel =
    selectedDestinations.length === 0
      ? 'Select saved destinations'
      : selectedDestinations.length === 1
        ? selectedDestinations[0].name
        : `${selectedDestinations.length} destinations selected`

  const toggleDestination = (destinationId: string) => {
    if (selectedDestinationIds.includes(destinationId)) {
      onSelectedDestinationIdsChange(
        selectedDestinationIds.filter((current) => current !== destinationId)
      )
      return
    }
    onSelectedDestinationIdsChange([...selectedDestinationIds, destinationId])
  }

  return (
    <div className="space-y-3" ref={containerRef}>
      <div className="relative">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-border/70 bg-background px-3 py-2.5 text-left text-sm"
          onClick={() => setOpen((current) => !current)}
          data-testid="destination-multi-select-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="truncate">{summaryLabel}</span>
          <ChevronDown className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        {open ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-md border border-border/70 bg-background shadow-lg">
            {showSearch ? (
              <div className="border-b border-border/70 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search destinations"
                    className="pl-9"
                  />
                </div>
              </div>
            ) : null}

            <div className="max-h-72 overflow-auto p-2">
              {isLoading ? (
                <div className="px-3 py-8 text-sm text-muted-foreground">
                  Loading destinations...
                </div>
              ) : groups.length > 0 ? (
                groups.map((group) => {
                  const meta = TYPE_META[group.type]
                  const Icon = meta.icon

                  return (
                    <div key={group.type} className="mb-1 last:mb-0">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </div>
                      {group.destinations.map((destination) => {
                        const isSelected = selectedDestinationIds.includes(destination.id)

                        return (
                          <button
                            key={destination.id}
                            type="button"
                            className={cn(
                              'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors',
                              destination.enabled
                                ? 'hover:bg-accent'
                                : 'cursor-not-allowed text-muted-foreground opacity-60',
                              isSelected && 'bg-accent'
                            )}
                            onClick={() => {
                              if (!destination.enabled) return
                              toggleDestination(destination.id)
                            }}
                            aria-disabled={!destination.enabled}
                          >
                            <span className="truncate">
                              {destination.name}
                              {destination.enabled ? '' : ' (disabled)'}
                            </span>
                            {isSelected ? <Check className="h-4 w-4 text-foreground" /> : null}
                          </button>
                        )
                      })}
                    </div>
                  )
                })
              ) : destinations.length > 0 ? (
                <div className="px-3 py-8 text-sm text-muted-foreground">
                  No destinations match "{query.trim()}".
                </div>
              ) : (
                <div className="px-3 py-8 text-sm text-muted-foreground">
                  No saved destinations yet. Create them under Settings → Alert destinations.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {selectedDestinations.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedDestinations.map((destination) => {
            const Icon = TYPE_META[destination.type].icon

            return (
              <Badge
                key={destination.id}
                variant="outline"
                className="gap-1 border-border/70 bg-background"
              >
                <Icon className="h-3 w-3 text-muted-foreground" />
                {destination.name}
                <button
                  type="button"
                  className="ml-1 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => toggleDestination(destination.id)}
                  aria-label={`Remove ${destination.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
