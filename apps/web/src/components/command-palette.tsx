import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
  BarChart3,
  BellPlus,
  BellRing,
  Calendar,
  CornerDownLeft,
  Database,
  Layers,
  type LucideIcon,
  Monitor,
  Moon,
  Network,
  Plug,
  Search,
  Settings,
  Sun,
} from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useConnection } from '@/components/connection-provider'
import { useTheme } from '@/components/theme-provider'
import { Kbd } from '@/components/ui/kbd'
import { type UseQueuesOptions, useQueues } from '@/hooks/use-queues'
import { cn } from '@/lib/utils'

interface CommandPaletteContextValue {
  open: () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({ open: () => {} })

/** Opens the palette from anywhere (the sidebar search row, empty states, …). */
export function useCommandPalette() {
  return useContext(CommandPaletteContext)
}

interface Command {
  id: string
  group: 'Go to' | 'Queues' | 'Connections' | 'Actions'
  label: string
  /** Extra text matched by search but not shown. */
  keywords?: string
  hint?: string
  icon: LucideIcon
  run: () => void
}

const GROUP_ORDER: Command['group'][] = ['Go to', 'Queues', 'Connections', 'Actions']
const PALETTE_QUEUE_OPTIONS: UseQueuesOptions = { pageSize: 100 }
const MAX_QUEUE_RESULTS = 8

function matches(command: Command, terms: string[]) {
  const haystack = `${command.label} ${command.keywords ?? ''} ${command.group}`.toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

/**
 * ⌘K command palette. One keystroke reaches any page, queue, or connection,
 * so nothing in the product is more than a few keys away.
 */
export function CommandPaletteProvider({
  orgSlug,
  children,
}: {
  orgSlug: string | undefined
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const value = useMemo(() => ({ open }), [open])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault()
        setIsOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <DialogPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-[14vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
            {isOpen ? <PaletteBody orgSlug={orgSlug} onClose={() => setIsOpen(false)} /> : null}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </CommandPaletteContext.Provider>
  )
}

function PaletteBody({ orgSlug, onClose }: { orgSlug: string | undefined; onClose: () => void }) {
  const navigate = useNavigate()
  const { connections, currentConnection, setCurrentConnection } = useConnection()
  const { setTheme } = useTheme()
  const { data: queuesData } = useQueues(PALETTE_QUEUE_OPTIONS)
  const params = useParams({ strict: false }) as { connectionId?: string }
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const connectionId = params.connectionId ?? currentConnection?.id

  const commands = useMemo<Command[]>(() => {
    const result: Command[] = []
    const go = (to: string) => () => void navigate({ to })
    const base = orgSlug && connectionId ? `/${orgSlug}/c/${connectionId}` : null

    if (base) {
      result.push(
        { id: 'go-queues', group: 'Go to', label: 'Queues', icon: Layers, run: go(base) },
        {
          id: 'go-alerts',
          group: 'Go to',
          label: 'Alerts',
          keywords: 'incidents',
          icon: BellRing,
          run: go(`${base}/alerts`),
        },
        {
          id: 'go-rules',
          group: 'Go to',
          label: 'Alert rules',
          keywords: 'alerts policy',
          icon: BellRing,
          run: go(`${base}/alerts/rules`),
        },
        {
          id: 'go-analytics',
          group: 'Go to',
          label: 'Analytics',
          keywords: 'redis health metrics throughput',
          icon: BarChart3,
          run: go(`${base}/analytics`),
        },
        {
          id: 'go-workers',
          group: 'Go to',
          label: 'Workers',
          icon: Network,
          run: go(`${base}/workers`),
        },
        {
          id: 'go-schedules',
          group: 'Go to',
          label: 'Scheduled Jobs',
          keywords: 'cron repeatable schedulers',
          icon: Calendar,
          run: go(`${base}/scheduled-jobs`),
        },
        {
          id: 'go-keys',
          group: 'Go to',
          label: 'KV Explorer',
          keywords: 'redis keys',
          icon: Database,
          run: go(`${base}/redis-keys`),
        }
      )
    }
    if (orgSlug) {
      result.push({
        id: 'go-settings',
        group: 'Go to',
        label: 'Settings',
        keywords: 'connections team billing appearance integrations destinations',
        icon: Settings,
        run: go(`/${orgSlug}/settings`),
      })
    }

    if (base) {
      for (const queue of queuesData?.queues ?? []) {
        result.push({
          id: `queue-${queue.name}`,
          group: 'Queues',
          label: queue.name,
          hint:
            queue.jobCounts.failed > 0
              ? `${queue.jobCounts.failed.toLocaleString()} failed`
              : undefined,
          icon: Layers,
          run: go(`${base}/queues/${encodeURIComponent(queue.name)}`),
        })
      }
    }

    for (const connection of connections) {
      if (connection.id === currentConnection?.id) continue
      result.push({
        id: `connection-${connection.id}`,
        group: 'Connections',
        label: `Switch to ${connection.name}`,
        keywords: connection.environment ?? '',
        hint: connection.environment ?? undefined,
        icon: Plug,
        run: () => setCurrentConnection(connection),
      })
    }

    if (base) {
      result.push({
        id: 'action-new-rule',
        group: 'Actions',
        label: 'Create alert rule',
        icon: BellPlus,
        run: go(`${base}/alerts/new`),
      })
    }
    result.push(
      {
        id: 'theme-light',
        group: 'Actions',
        label: 'Use light theme',
        icon: Sun,
        run: () => setTheme('light'),
      },
      {
        id: 'theme-dark',
        group: 'Actions',
        label: 'Use dark theme',
        icon: Moon,
        run: () => setTheme('dark'),
      },
      {
        id: 'theme-system',
        group: 'Actions',
        label: 'Match system theme',
        icon: Monitor,
        run: () => setTheme('system'),
      }
    )
    return result
  }, [
    connectionId,
    connections,
    currentConnection?.id,
    navigate,
    orgSlug,
    queuesData?.queues,
    setCurrentConnection,
    setTheme,
  ])

  const visible = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const filtered = terms.length ? commands.filter((command) => matches(command, terms)) : commands
    let queueCount = 0
    const capped = filtered.filter((command) => {
      if (command.group !== 'Queues') return true
      queueCount += 1
      return queueCount <= MAX_QUEUE_RESULTS
    })
    return GROUP_ORDER.flatMap((group) => capped.filter((command) => command.group === group))
  }, [commands, query])

  const clampedIndex = Math.min(activeIndex, Math.max(visible.length - 1, 0))

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${clampedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [clampedIndex])

  const runCommand = (command: Command | undefined) => {
    if (!command) return
    onClose()
    command.run()
  }

  return (
    <>
      <div className="flex items-center gap-2.5 border-b px-4">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        {/* Radix focuses the first focusable element on open, which is this input. */}
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex(Math.min(clampedIndex + 1, visible.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex(Math.max(clampedIndex - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              runCommand(visible[clampedIndex])
            }
          }}
          placeholder="Search pages, queues, connections…"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={visible.length ? `${listId}-${clampedIndex}` : undefined}
          aria-label="Search commands"
          className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-faint"
        />
        <Kbd>esc</Kbd>
      </div>
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Commands"
        className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5"
      >
        {visible.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
            Nothing matches “{query}”.
          </p>
        ) : (
          visible.map((command, index) => {
            const Icon = command.icon
            const isActive = index === clampedIndex
            const startsGroup = index === 0 || visible[index - 1].group !== command.group
            return (
              <div key={command.id}>
                {startsGroup ? (
                  <div className="eyebrow px-2.5 pb-1 pt-2.5">{command.group}</div>
                ) : null}
                <div
                  id={`${listId}-${index}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={isActive}
                  data-index={index}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => runCommand(command)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') runCommand(command)
                  }}
                  className={cn(
                    'flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px]',
                    isActive ? 'bg-accent text-accent-foreground' : 'text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      command.group === 'Queues' && 'font-mono text-xs'
                    )}
                  >
                    {command.label}
                  </span>
                  {command.hint ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{command.hint}</span>
                  ) : null}
                  {isActive ? (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
