import { createFileRoute } from '@tanstack/react-router'

// Redis types - matches API response
type RedisDataType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'none' | 'unknown'

interface RedisKeyInfo {
  key: string
  type: RedisDataType
  ttl: number
  memoryBytes?: number
}

import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { JsonViewer } from '@/components/json-viewer'
import { PageTitle } from '@/components/page-title'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Panel } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  type GetKeyValueResponse,
  useDeleteRedisKey,
  useRedisKeySearch,
  useRedisKeyValue,
} from '@/hooks/use-redis-keys'
import { cn } from '@/lib/utils'

// Helper to check if a key is a bull-related key
function isBullKey(key: string): boolean {
  return key.startsWith('bull:') || key.startsWith('bullmq:')
}

export const Route = createFileRoute('/$orgSlug/c/$connectionId/redis-keys')({
  component: RedisKeysPage,
})

type TypeFilter = 'all' | 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream'
type ValueView = 'table' | 'json'

const TYPE_FILTERS: TypeFilter[] = ['all', 'string', 'hash', 'list', 'set', 'zset', 'stream']
const ROW_HEIGHT = 34
const KEY_TAIL_LENGTH = 12
const ICON_BUTTON = 'h-7 w-7 shrink-0'

function RedisKeysPage() {
  const [searchPattern, setSearchPattern] = useState('*')
  const [debouncedPattern, setDebouncedPattern] = useState('*')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null)
  const [excludeBullKeys, setExcludeBullKeys] = useState(false)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const parentRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    trackEvent(AnalyticsEvents.REDIS_KEYS_VIEWED)
  }, [])

  // Debounce search pattern
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPattern(searchPattern || '*')
    }, 300)
    return () => clearTimeout(timer)
  }, [searchPattern])

  // Reset selected key when the result set changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: the pattern and filter are the triggers
  useEffect(() => {
    setSelectedKey(null)
  }, [debouncedPattern, excludeBullKeys])

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useRedisKeySearch(debouncedPattern, { excludeBull: excludeBullKeys })

  const {
    data: keyValue,
    isLoading: isLoadingValue,
    isError: isValueError,
  } = useRedisKeyValue(selectedKey)

  const deleteKeyMutation = useDeleteRedisKey()

  // Flatten all pages into a single array
  const allKeys = useMemo(() => {
    return data?.pages.flatMap((page) => page.keys) ?? []
  }, [data])

  // The type filter narrows what has been scanned so far; scrolling keeps scanning.
  const visibleKeys = useMemo(
    () => (typeFilter === 'all' ? allKeys : allKeys.filter((entry) => entry.type === typeFilter)),
    [allKeys, typeFilter]
  )

  // Virtualizer for efficient rendering
  const virtualizer = useVirtualizer({
    count: visibleKeys.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  // Infinite scroll - load more when near bottom
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    )

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current)
    }

    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const handleDeleteKey = useCallback(async () => {
    if (!keyToDelete) return
    try {
      await deleteKeyMutation.mutateAsync(keyToDelete)
      if (selectedKey === keyToDelete) {
        setSelectedKey(null)
      }
      setDeleteDialogOpen(false)
      setKeyToDelete(null)
    } catch (err) {
      console.error('Failed to delete key:', err)
    }
  }, [keyToDelete, selectedKey, deleteKeyMutation])

  const selectKey = useCallback((key: string) => {
    trackEvent(AnalyticsEvents.REDIS_KEY_SELECTED, { redis_key: key })
    setSelectedKey(key)
  }, [])

  // Arrow keys move focus through the list; Enter or Space opens the focused key.
  const focusRow = useCallback(
    (index: number) => {
      if (index < 0 || index >= visibleKeys.length) return
      virtualizer.scrollToIndex(index)
      requestAnimationFrame(() => {
        parentRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus()
      })
    },
    [virtualizer, visibleKeys.length]
  )

  const totalKeys = data?.pages[0]?.total
  const topBarConfig = useMemo(
    () => ({
      left: (
        <PageTitle
          title="KV Explorer"
          meta={
            typeof totalKeys === 'number' ? (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {totalKeys.toLocaleString()} keys
              </span>
            ) : undefined
          }
        />
      ),
    }),
    [totalKeys]
  )

  useAppTopBar(topBarConfig)

  const selectedInfo = selectedKey ? allKeys.find((entry) => entry.key === selectedKey) : undefined

  return (
    <Panel className="grid h-full min-h-[480px] grid-cols-1 grid-rows-1 md:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)] xl:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
      {/* Key list */}
      <div
        className={cn(
          'min-h-0 min-w-0 flex-col md:flex md:border-r',
          selectedKey ? 'hidden' : 'flex'
        )}
      >
        <div className="shrink-0 space-y-2 border-b p-3">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <Input
                placeholder="Search pattern (e.g., user:*, *session*)"
                aria-label="Search pattern"
                value={searchPattern}
                onChange={(e) => setSearchPattern(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                className="pl-8 font-mono"
              />
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => refetch()}
                    disabled={isLoading}
                    aria-label="Refresh keys"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
              {TYPE_FILTERS.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={typeFilter === type}
                  onClick={() => setTypeFilter(type)}
                  className={cn(
                    'h-6 shrink-0 rounded-[5px] border px-1.5 font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    typeFilter === type
                      ? 'border-border-strong bg-muted text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={excludeBullKeys ? 'secondary' : 'ghost'}
                    size="xs"
                    className="h-6 shrink-0 px-1.5 font-mono text-[11px]"
                    aria-pressed={excludeBullKeys}
                    onClick={() => {
                      const newValue = !excludeBullKeys
                      trackEvent(AnalyticsEvents.REDIS_KEY_FILTER_CHANGED, {
                        exclude_bull_keys: newValue,
                      })
                      setExcludeBullKeys(newValue)
                    }}
                  >
                    <EyeOff className="h-3 w-3" />
                    Hide bull:*
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{excludeBullKeys ? 'Show' : 'Hide'} BullMQ-managed keys in results</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="flex h-7 shrink-0 items-center justify-between gap-3 border-b bg-muted/40 px-3">
          <span className="eyebrow">Key</span>
          <span className="truncate font-mono text-[10px] tabular-nums text-muted-foreground">
            {isLoading
              ? 'scanning…'
              : `${visibleKeys.length.toLocaleString()}${hasNextPage ? '+' : ''} ${typeFilter === 'all' ? '' : `${typeFilter} `}${visibleKeys.length === 1 && !hasNextPage ? 'key' : 'keys'}`}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {isLoading ? (
            <div className="space-y-px p-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              size="inline"
              icon={AlertCircle}
              tone="danger"
              title="Failed to search keys"
              description={error instanceof Error ? error.message : 'Unknown error'}
              className="h-full"
              actions={
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              }
            />
          ) : visibleKeys.length === 0 && !hasNextPage ? (
            <EmptyState
              size="inline"
              icon={Search}
              title="No keys found"
              description={
                typeFilter === 'all'
                  ? 'Try a different search pattern'
                  : `No ${typeFilter} keys match this pattern`
              }
              className="h-full"
              actions={
                typeFilter === 'all' ? undefined : (
                  <Button variant="outline" size="sm" onClick={() => setTypeFilter('all')}>
                    Show all types
                  </Button>
                )
              }
            />
          ) : (
            <div ref={parentRef} className="h-full overflow-auto">
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const keyInfo = visibleKeys[virtualRow.index]
                  return (
                    <KeyRow
                      key={keyInfo.key}
                      index={virtualRow.index}
                      keyInfo={keyInfo}
                      isSelected={selectedKey === keyInfo.key}
                      onClick={() => selectKey(keyInfo.key)}
                      onMove={(delta) => focusRow(virtualRow.index + delta)}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    />
                  )
                })}
              </div>

              {/* Load more trigger */}
              <div ref={loadMoreRef} className="h-4" />

              {/* Loading indicator */}
              {isFetchingNextPage && (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading more keys...</span>
                </div>
              )}

              {/* End of list indicator */}
              {!hasNextPage && allKeys.length > 10 && (
                <div className="flex items-center justify-center py-3">
                  <span className="font-mono text-[11px] text-faint">
                    {allKeys.length.toLocaleString()} keys loaded
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Value */}
      <section
        aria-label="Value details"
        className={cn('min-h-0 min-w-0 flex-col md:flex', selectedKey ? 'flex' : 'hidden')}
      >
        {selectedKey ? (
          <ValuePanel
            key={selectedKey}
            selectedKey={selectedKey}
            listedInfo={selectedInfo}
            keyValue={keyValue}
            isLoadingValue={isLoadingValue}
            isValueError={isValueError}
            onClose={() => setSelectedKey(null)}
            onDelete={() => {
              setKeyToDelete(selectedKey)
              setDeleteDialogOpen(true)
            }}
          />
        ) : (
          <EmptyState
            size="inline"
            icon={KeyRound}
            title="Select a key"
            description="Pick a key from the list to read its value, type, TTL, and memory footprint. Use * as a wildcard in the pattern, like user:* or *:cache:*."
            className="h-full"
          />
        )}
      </section>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete key</DialogTitle>
            <DialogDescription>
              This removes the key and its value from Redis. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <code className="block break-all rounded-md border bg-muted px-3 py-2 font-mono text-[13px]">
            {keyToDelete}
          </code>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteKey}
              disabled={deleteKeyMutation.isPending}
            >
              {deleteKeyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete key
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}

// Key Row Component
interface KeyRowProps {
  index: number
  keyInfo: RedisKeyInfo
  isSelected: boolean
  onClick: () => void
  onMove: (delta: number) => void
  style: React.CSSProperties
}

function KeyRow({ index, keyInfo, isSelected, onClick, onMove, style }: KeyRowProps) {
  // Long keys differ at the end (job ids, hashes), so keep the tail and elide the middle.
  const tailLength = keyInfo.key.length > KEY_TAIL_LENGTH * 2 ? KEY_TAIL_LENGTH : 0
  const head = keyInfo.key.slice(0, keyInfo.key.length - tailLength)
  const tail = keyInfo.key.slice(keyInfo.key.length - tailLength)

  return (
    // biome-ignore lint/a11y/useSemanticElements: div required for virtualization styling
    <div
      style={style}
      role="button"
      tabIndex={0}
      data-index={index}
      data-key-row=""
      aria-pressed={isSelected}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 border-b px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40',
        isSelected
          ? 'bg-accent shadow-[inset_2px_0_0_0_var(--color-foreground)]'
          : 'hover:bg-muted/60'
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          onMove(1)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          onMove(-1)
        }
      }}
    >
      {/* The key stays first in the DOM so the row reads (and tests) as its key. */}
      <span className="flex min-w-0 flex-1 font-mono" title={keyInfo.key}>
        <span className="truncate whitespace-pre">{head}</span>
        <span className="shrink-0 whitespace-pre">{tail}</span>
      </span>
      <TypeTag type={keyInfo.type} className="order-first" />
      {keyInfo.ttl > 0 ? (
        <span
          className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
          title={`Expires in ${formatTTLLong(keyInfo.ttl)}`}
        >
          {formatTTL(keyInfo.ttl)}
        </span>
      ) : null}
    </div>
  )
}

/** Fixed-width mono tag so keys line up in a column. Types are categories, not states: no colour. */
function TypeTag({ type, className }: { type: RedisDataType; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] w-[46px] shrink-0 items-center justify-center rounded-[4px] border bg-muted font-mono text-[10px] leading-none text-muted-foreground',
        className
      )}
    >
      {type}
    </span>
  )
}

interface ValuePanelProps {
  selectedKey: string
  listedInfo?: RedisKeyInfo
  keyValue?: GetKeyValueResponse
  isLoadingValue: boolean
  isValueError: boolean
  onClose: () => void
  onDelete: () => void
}

function ValuePanel({
  selectedKey,
  listedInfo,
  keyValue,
  isLoadingValue,
  isValueError,
  onClose,
  onDelete,
}: ValuePanelProps) {
  const isBullManaged = isBullKey(selectedKey)

  // The list already knows type, TTL and size, so facts render before the value arrives.
  const type = keyValue?.type ?? listedInfo?.type
  const ttl = keyValue?.ttl ?? listedInfo?.ttl
  const memoryBytes = keyValue?.memoryBytes ?? listedInfo?.memoryBytes

  return (
    <>
      <div className="flex shrink-0 items-start gap-2 border-b px-3 py-2.5 md:px-4">
        <Button
          variant="ghost"
          size="icon"
          className={cn(ICON_BUTTON, '-ml-1 md:hidden')}
          onClick={onClose}
          aria-label="Back to keys"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <code className="min-w-0 flex-1 break-all py-1 font-mono text-[13px] font-medium leading-5">
          {selectedKey}
        </code>
        <div className="flex shrink-0 items-center gap-0.5">
          <CopyButton text={selectedKey} />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* A disabled button swallows hover, so the span carries the tooltip. */}
                <span className={isBullManaged ? 'cursor-not-allowed' : undefined}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      ICON_BUTTON,
                      !isBullManaged && 'hover:bg-status-danger/10 hover:text-status-danger'
                    )}
                    disabled={isBullManaged}
                    onClick={onDelete}
                    aria-label="Delete key"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className={cn(isBullManaged && 'max-w-xs')}>
                {isBullManaged ? (
                  <>
                    <p className="font-medium">Cannot delete BullMQ keys</p>
                    <p className="mt-0.5 font-normal opacity-80">
                      Bull-related keys must be managed through their respective queues using
                      Durabull.
                    </p>
                  </>
                ) : (
                  'Delete key'
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(ICON_BUTTON, 'hidden md:inline-flex')}
                  onClick={onClose}
                  aria-label="Close value panel"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close value panel</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <dl className="grid shrink-0 grid-cols-2 gap-px border-b bg-border sm:grid-cols-4">
        <Fact label="Type">
          {type ? (
            <span className="flex items-center gap-2">
              {type}
              {isBullManaged ? (
                <Badge variant="neutral" className="hidden xl:inline-flex">
                  BullMQ
                </Badge>
              ) : null}
            </span>
          ) : (
            '—'
          )}
        </Fact>
        <Fact
          label="TTL"
          title={ttl !== undefined && ttl > 0 ? `${ttl.toLocaleString()} s` : undefined}
        >
          {ttl === undefined ? '—' : ttl > 0 ? formatTTLLong(ttl) : 'No expiry'}
        </Fact>
        <Fact
          label="Memory"
          title={memoryBytes ? `${memoryBytes.toLocaleString()} bytes` : undefined}
        >
          {memoryBytes ? formatBytes(memoryBytes) : '—'}
        </Fact>
        <Fact label={type === 'string' ? 'Format' : 'Items'}>
          {!keyValue
            ? '—'
            : keyValue.type === 'string'
              ? describeStringValue(keyValue.value)
              : (keyValue.length?.toLocaleString() ?? '—')}
        </Fact>
      </dl>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoadingValue ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : isValueError ? (
          <EmptyState
            size="inline"
            icon={AlertCircle}
            tone="danger"
            title="Failed to load value"
            description="The key may have been deleted or expired"
            className="h-full"
          />
        ) : keyValue ? (
          <ValueBody keyValue={keyValue} />
        ) : null}
      </div>
    </>
  )
}

/** Renders the value by Redis type: rows for collections, a tree for JSON, plain text otherwise. */
function ValueBody({ keyValue }: { keyValue: GetKeyValueResponse }) {
  const [view, setView] = useState<ValueView>('table')
  const rows = toRows(keyValue)
  const rowsNote =
    rows && keyValue.length !== undefined && keyValue.length > rows.items.length
      ? `first ${rows.items.length.toLocaleString()} of ${keyValue.length.toLocaleString()}`
      : null

  return rows && view === 'table' ? (
    <table className="w-full table-fixed text-[13px]">
      <colgroup>
        <col className={rows.labelWidth} />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th
            scope="col"
            className="eyebrow sticky top-0 z-10 h-9 border-b bg-muted px-3 text-left md:pl-4"
          >
            {rows.labelHeader}
          </th>
          <th scope="col" className="sticky top-0 z-10 h-9 border-b bg-muted px-3 md:pr-4">
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow truncate">
                {rows.valueHeader}
                {rowsNote ? ` · ${rowsNote}` : ''}
              </span>
              <ValueViewToggle view={view} onChange={setView} />
            </div>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.items.length === 0 ? (
          <tr>
            <td colSpan={2} className="px-3 py-3 text-muted-foreground md:px-4">
              This key is empty.
            </td>
          </tr>
        ) : (
          rows.items.map((item, index) => (
            <tr key={`${index}-${item.label}`} className="align-top hover:bg-muted/40">
              <th
                scope="row"
                className="break-all px-3 py-1.5 text-left font-mono text-xs font-normal leading-5 text-muted-foreground md:pl-4"
              >
                {item.label}
              </th>
              <td className="whitespace-pre-wrap px-3 py-1.5 font-mono text-xs leading-5 [overflow-wrap:anywhere] md:pr-4">
                {item.value}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  ) : rows ? (
    <>
      <div className="sticky top-0 z-10 flex h-9 items-center justify-between gap-3 border-b bg-muted px-3 md:px-4">
        <span className="eyebrow truncate">JSON{rowsNote ? ` · ${rowsNote}` : ''}</span>
        <ValueViewToggle view={view} onChange={setView} />
      </div>
      <div className="p-3 md:p-4">
        <JsonViewer data={keyValue.value} initialExpanded={true} maxInitialDepth={3} />
      </div>
    </>
  ) : isStructured(keyValue.value) ? (
    <div className="p-3 md:p-4">
      <JsonViewer data={keyValue.value} initialExpanded={true} maxInitialDepth={3} />
    </div>
  ) : (
    <pre className="whitespace-pre-wrap p-3 font-mono text-[13px] leading-5 [overflow-wrap:anywhere] md:p-4">
      {String(keyValue.value)}
    </pre>
  )
}

function ValueViewToggle({
  view,
  onChange,
}: {
  view: ValueView
  onChange: (view: ValueView) => void
}) {
  return (
    <Tabs value={view} onValueChange={(next) => onChange(next as ValueView)}>
      <TabsList role="group" aria-label="Value view" className="h-6">
        <TabsTrigger
          value="table"
          aria-pressed={view === 'table'}
          className="px-2 font-sans text-[11px] normal-case tracking-normal"
        >
          Table
        </TabsTrigger>
        <TabsTrigger
          value="json"
          aria-pressed={view === 'json'}
          className="px-2 font-sans text-[11px] normal-case tracking-normal"
        >
          JSON
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

function Fact({
  label,
  title,
  children,
}: {
  label: string
  title?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0 bg-card px-3 py-2 md:px-4" title={title}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-[13px] tabular-nums">{children}</dd>
    </div>
  )
}

// Copy Button Component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      trackEvent(AnalyticsEvents.REDIS_KEY_COPIED, { redis_key: text })
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={ICON_BUTTON}
            onClick={handleCopy}
            aria-label="Copy key"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-status-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied!' : 'Copy key'}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/* ------------------------------------------------------------------ */
/* Type-specific value shaping                                         */
/* ------------------------------------------------------------------ */

interface ValueRows {
  labelHeader: string
  valueHeader: string
  /** Width of the label column; scores and indexes need less room than hash fields. */
  labelWidth: string
  items: Array<{ label: string; value: string }>
}

function isStructured(value: unknown): boolean {
  return typeof value === 'object' && value !== null
}

/** String keys are parsed as JSON when they can be; say which shape came back. */
function describeStringValue(value: unknown): string {
  if (typeof value === 'string') return `text · ${value.length.toLocaleString()} chars`
  if (Array.isArray(value)) return 'JSON array'
  if (isStructured(value)) return 'JSON object'
  return typeof value
}

function cellText(value: unknown): string {
  if (typeof value === 'string') return value
  if (isStructured(value)) return JSON.stringify(value, null, 2)
  return String(value)
}

/** Hashes, lists, sets and sorted sets read best as rows; everything else falls through. */
function toRows(keyValue: GetKeyValueResponse): ValueRows | null {
  const { type, value } = keyValue

  if (type === 'hash' && isStructured(value) && !Array.isArray(value)) {
    return {
      labelHeader: 'Field',
      valueHeader: 'Value',
      labelWidth: 'w-[38%] sm:w-[200px]',
      items: Object.entries(value as Record<string, unknown>).map(([field, fieldValue]) => ({
        label: field,
        value: cellText(fieldValue),
      })),
    }
  }

  if (!Array.isArray(value)) return null

  if (type === 'zset') {
    return {
      labelHeader: 'Score',
      valueHeader: 'Member',
      labelWidth: 'w-[150px]',
      items: (value as Array<{ member: unknown; score: number }>).map((entry) => ({
        label: String(entry.score),
        value: cellText(entry.member),
      })),
    }
  }

  if (type === 'list' || type === 'set') {
    return {
      labelHeader: type === 'list' ? 'Index' : '#',
      valueHeader: type === 'list' ? 'Element' : 'Member',
      labelWidth: 'w-[68px]',
      items: value.map((entry, index) => ({ label: String(index), value: cellText(entry) })),
    }
  }

  return null
}

// Utility functions
function formatTTL(seconds: number): string {
  if (seconds < 0) return 'never'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

function formatTTLLong(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
