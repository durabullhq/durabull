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
  AlertTriangle,
  Braces,
  Check,
  Clock,
  Copy,
  Database,
  EyeOff,
  HelpCircle,
  Key,
  Layers,
  List,
  Loader2,
  MemoryStick,
  Radio,
  RefreshCw,
  Search,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { useConnection } from '@/components/connection-provider'
import { JsonViewer } from '@/components/json-viewer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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

// Type icons
const typeIcons: Record<RedisDataType, React.ComponentType<{ className?: string }>> = {
  string: Key,
  hash: Braces,
  list: List,
  set: Layers,
  zset: Layers,
  stream: Radio,
  none: HelpCircle,
  unknown: HelpCircle,
}

// Type colors
const typeColors: Record<RedisDataType, string> = {
  string: 'text-status-success bg-status-success/10 border-status-success/20',
  hash: 'text-status-priority bg-status-priority/10 border-status-priority/20',
  list: 'text-status-active bg-status-active/10 border-status-active/20',
  set: 'text-status-warning bg-status-warning/10 border-status-warning/20',
  zset: 'text-status-delayed bg-status-delayed/10 border-status-delayed/20',
  stream: 'text-status-priority bg-status-priority/10 border-status-priority/20',
  none: 'text-gray-500 bg-gray-500/10 border-gray-500/20',
  unknown: 'text-gray-500 bg-gray-500/10 border-gray-500/20',
}

function RedisKeysPage() {
  const { currentConnection } = useConnection()
  const [searchPattern, setSearchPattern] = useState('*')
  const [debouncedPattern, setDebouncedPattern] = useState('*')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null)
  const [excludeBullKeys, setExcludeBullKeys] = useState(false)

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
  useEffect(() => {
    setSelectedKey(null)
  }, [debouncedPattern, excludeBullKeys])

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
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

  // Virtualizer for efficient rendering
  const virtualizer = useVirtualizer({
    count: allKeys.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 10,
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

  const totalKeys = data?.pages[0]?.total
  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Database className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Redis Explorer</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">
            Search and inspect keys in your Redis database
          </span>
        </div>
      ),
    }),
    []
  )

  useAppTopBar(topBarConfig)

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      {/* Stats Bar */}
      <div className="grid shrink-0 gap-4 md:grid-cols-4">
        <StatCard
          title="Connection"
          value={currentConnection?.name ?? 'Not connected'}
          icon={Database}
          variant="default"
        />
        <StatCard
          title="Total Keys"
          value={totalKeys?.toLocaleString() ?? '—'}
          icon={Key}
          loading={isLoading}
          variant="blue"
        />
        <StatCard
          title="Search Results"
          value={allKeys.length.toLocaleString()}
          icon={Search}
          loading={isLoading}
          variant="green"
        />
        <StatCard title="Pattern" value={debouncedPattern} icon={Zap} variant="purple" />
      </div>

      {/* Main Content */}
      <div
        className={cn(
          'grid min-h-[500px] flex-1 gap-4 overflow-hidden',
          selectedKey
            ? 'grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]'
            : 'grid-cols-1'
        )}
      >
        {/* Key List */}
        <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <CardHeader className="border-b bg-muted/30 py-3 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                Keys
              </CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => refetch()}
                      disabled={isLoading}
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {/* Search Input */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search pattern (e.g., user:*, *session*)"
                value={searchPattern}
                onChange={(e) => setSearchPattern(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
            <div className="flex items-center justify-between mt-3 gap-4">
              <p className="text-xs text-muted-foreground">
                Use * as wildcard. Examples: <code className="text-primary">user:*</code>,{' '}
                <code className="text-primary">*:cache:*</code>
              </p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={excludeBullKeys ? 'secondary' : 'ghost'}
                      size="sm"
                      className={cn(
                        'h-7 text-xs gap-1.5 shrink-0',
                        excludeBullKeys &&
                          'bg-status-warning/10 text-status-warning hover:bg-status-warning/20'
                      )}
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
          </CardHeader>

          <CardContent className="flex-1 p-0 overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="rounded-full bg-destructive/10 p-3 mb-3">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <p className="font-medium text-destructive">Failed to search keys</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {error instanceof Error ? error.message : 'Unknown error'}
                </p>
              </div>
            ) : allKeys.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="rounded-full bg-muted p-4 mb-3">
                  <Search className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-medium">No keys found</p>
                <p className="text-sm text-muted-foreground mt-1">Try a different search pattern</p>
              </div>
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
                    const keyInfo = allKeys[virtualRow.index]
                    return (
                      <KeyRow
                        key={keyInfo.key}
                        keyInfo={keyInfo}
                        isSelected={selectedKey === keyInfo.key}
                        onClick={() => {
                          trackEvent(AnalyticsEvents.REDIS_KEY_SELECTED, {
                            redis_key: keyInfo.key,
                          })
                          setSelectedKey(keyInfo.key)
                        }}
                        onDelete={() => {
                          setKeyToDelete(keyInfo.key)
                          setDeleteDialogOpen(true)
                        }}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
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
                  <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading more keys...</span>
                  </div>
                )}

                {/* End of list indicator */}
                {!hasNextPage && allKeys.length > 10 && (
                  <div className="flex items-center justify-center py-4">
                    <span className="text-xs text-muted-foreground">
                      {allKeys.length.toLocaleString()} keys loaded
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedKey && (
          <ValuePanel
            selectedKey={selectedKey}
            keyValue={keyValue}
            isLoadingValue={isLoadingValue}
            isValueError={isValueError}
            onClose={() => setSelectedKey(null)}
          />
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this key? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <code className="block text-sm font-mono bg-muted p-3 rounded break-all">
              {keyToDelete}
            </code>
          </div>
          <DialogFooter>
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Key
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Key Row Component
interface KeyRowProps {
  keyInfo: RedisKeyInfo
  isSelected: boolean
  onClick: () => void
  onDelete: () => void
  style: React.CSSProperties
}

function KeyRow({ keyInfo, isSelected, onClick, onDelete, style }: KeyRowProps) {
  const Icon = typeIcons[keyInfo.type] || Key
  const isBullManaged = isBullKey(keyInfo.key)

  return (
    // biome-ignore lint/a11y/useSemanticElements: div required for virtualization styling; contains nested Button for delete
    <div
      style={style}
      role="button"
      tabIndex={0}
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b cursor-pointer transition-colors group',
        isSelected
          ? 'bg-primary/10 border-l-2 border-l-primary'
          : 'hover:bg-muted/50 border-l-2 border-l-transparent'
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <div className={cn('p-2 rounded-lg border', typeColors[keyInfo.type])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-mono text-sm truncate" title={keyInfo.key}>
            {keyInfo.key}
          </p>
          {isBullManaged && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <AlertTriangle className="h-3 w-3 text-status-warning shrink-0" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>BullMQ managed key</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {keyInfo.type}
          </Badge>
          {keyInfo.ttl > 0 && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {formatTTL(keyInfo.ttl)}
            </span>
          )}
          {keyInfo.ttl === -1 && (
            <span className="text-[10px] text-muted-foreground">no expiry</span>
          )}
        </div>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7 transition-opacity',
                isBullManaged
                  ? 'opacity-30 cursor-not-allowed text-muted-foreground'
                  : 'opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10'
              )}
              disabled={isBullManaged}
              onClick={(e) => {
                e.stopPropagation()
                if (!isBullManaged) {
                  onDelete()
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className={cn(isBullManaged && 'max-w-xs')}>
            {isBullManaged ? (
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-status-warning shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Cannot delete BullMQ keys</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Bull-related keys must be managed through their respective queues using
                    Durabull.
                  </p>
                </div>
              </div>
            ) : (
              'Delete key'
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

interface ValuePanelProps {
  selectedKey: string
  keyValue?: GetKeyValueResponse
  isLoadingValue: boolean
  isValueError: boolean
  onClose: () => void
}

function ValuePanel({
  selectedKey,
  keyValue,
  isLoadingValue,
  isValueError,
  onClose,
}: ValuePanelProps) {
  return (
    <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden animate-in slide-in-from-right-2 fade-in duration-200">
      <CardHeader className="border-b bg-muted/30 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Braces className="h-4 w-4 text-muted-foreground" />
            Value Details
          </CardTitle>
          <div className="flex min-w-0 items-center gap-2">
            {keyValue && (
              <>
                <TypeBadge type={keyValue.type} />
                {keyValue.ttl > 0 && (
                  <Badge variant="outline" className="hidden font-mono text-xs sm:inline-flex">
                    <Clock className="h-3 w-3 mr-1" />
                    TTL: {formatTTL(keyValue.ttl)}
                  </Badge>
                )}
                {keyValue.memoryBytes && (
                  <Badge variant="outline" className="hidden font-mono text-xs xl:inline-flex">
                    <MemoryStick className="h-3 w-3 mr-1" />
                    {formatBytes(keyValue.memoryBytes)}
                  </Badge>
                )}
              </>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={onClose}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close value panel</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <code className="text-sm font-mono bg-muted px-2 py-1 rounded flex-1 truncate">
            {selectedKey}
          </code>
          <CopyButton text={selectedKey} />
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-auto p-4">
        {isLoadingValue ? (
          <div className="flex h-full flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Loading value...</p>
          </div>
        ) : isValueError ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="rounded-full bg-destructive/10 p-4 mb-3">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <p className="font-medium text-destructive">Failed to load value</p>
            <p className="text-sm text-muted-foreground mt-1">
              The key may have been deleted or expired
            </p>
          </div>
        ) : keyValue ? (
          <div className="space-y-4">
            {keyValue.length !== undefined && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">
                  {keyValue.length.toLocaleString()} {keyValue.length === 1 ? 'item' : 'items'}
                </Badge>
                {keyValue.length > 100 && <span className="text-xs">(showing first 100)</span>}
              </div>
            )}

            <JsonViewer data={keyValue.value} initialExpanded={true} maxInitialDepth={3} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// Type Badge Component
function TypeBadge({ type }: { type: RedisDataType }) {
  const Icon = typeIcons[type] || Key
  return (
    <Badge className={cn('font-mono text-xs gap-1', typeColors[type])}>
      <Icon className="h-3 w-3" />
      {type}
    </Badge>
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
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCopy}>
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

// Stat Card Component
type StatVariant = 'default' | 'blue' | 'green' | 'purple' | 'red'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  loading?: boolean
  variant?: StatVariant
}

const variantStyles: Record<StatVariant, { icon: string; accent: string }> = {
  default: {
    icon: 'text-muted-foreground',
    accent: 'bg-status-neutral/40',
  },
  blue: {
    icon: 'text-status-active',
    accent: 'bg-status-active',
  },
  green: {
    icon: 'text-status-success',
    accent: 'bg-status-success',
  },
  purple: {
    icon: 'text-status-priority',
    accent: 'bg-status-priority',
  },
  red: {
    icon: 'text-status-danger',
    accent: 'bg-status-danger',
  },
}

function StatCard({ title, value, icon: Icon, loading, variant = 'default' }: StatCardProps) {
  const styles = variantStyles[variant]

  return (
    <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
      <span className={cn('absolute inset-x-0 top-0 h-0.5', styles.accent)} aria-hidden="true" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="eyebrow">{title}</CardTitle>
        <Icon className={cn('h-4 w-4', styles.icon)} />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <div className="truncate font-mono text-xl font-semibold tracking-tight tabular-nums">
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Utility functions
function formatTTL(seconds: number): string {
  if (seconds < 0) return 'never'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}
