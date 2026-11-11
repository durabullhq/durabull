import { useLocation } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { APP_TOP_BAR_HEIGHT_CLASS } from '@/components/app-top-bar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMacElectronShell } from '@/hooks/use-electron-shell'
import { cn } from '@/lib/utils'

interface HistoryAvailability {
  canGoBack: boolean
  canGoForward: boolean
}

interface NavigationApiLike extends EventTarget {
  canGoBack?: boolean
  canGoForward?: boolean
}

const EMPTY_HISTORY_AVAILABILITY: HistoryAvailability = {
  canGoBack: false,
  canGoForward: false,
}

function readNativeHistoryAvailability(): HistoryAvailability | null {
  if (typeof window === 'undefined') return null

  const navigationApi = (window as Window & { navigation?: NavigationApiLike }).navigation
  if (
    navigationApi &&
    typeof navigationApi.canGoBack === 'boolean' &&
    typeof navigationApi.canGoForward === 'boolean'
  ) {
    return {
      canGoBack: navigationApi.canGoBack,
      canGoForward: navigationApi.canGoForward,
    }
  }

  return null
}

function useDesktopHistoryAvailability(enabled: boolean): HistoryAvailability {
  const location = useLocation()
  const [availability, setAvailability] = useState<HistoryAvailability>(EMPTY_HISTORY_AVAILABILITY)
  const entryStackRef = useRef<string[]>([])
  const entryIndexRef = useRef(-1)
  const historyTraversalRef = useRef(false)
  const currentEntryKey = `${location.pathname}?${JSON.stringify(location.search ?? {})}`

  const syncAvailability = useCallback(
    (currentEntryOverride?: string) => {
      if (!enabled || typeof window === 'undefined') {
        entryStackRef.current = []
        entryIndexRef.current = -1
        setAvailability(EMPTY_HISTORY_AVAILABILITY)
        return
      }

      const currentEntry =
        currentEntryOverride ??
        `${window.location.pathname}${window.location.search}${window.location.hash}`
      const currentStack = entryStackRef.current

      if (entryIndexRef.current === -1) {
        currentStack.push(currentEntry)
        entryIndexRef.current = 0
      } else if (currentStack[entryIndexRef.current] !== currentEntry) {
        if (historyTraversalRef.current) {
          if (currentStack[entryIndexRef.current - 1] === currentEntry) {
            entryIndexRef.current -= 1
          } else if (currentStack[entryIndexRef.current + 1] === currentEntry) {
            entryIndexRef.current += 1
          } else {
            const existingIndex = currentStack.lastIndexOf(currentEntry)
            if (existingIndex !== -1) {
              entryIndexRef.current = existingIndex
            } else {
              currentStack.push(currentEntry)
              entryIndexRef.current = currentStack.length - 1
            }
          }
        } else {
          currentStack.splice(entryIndexRef.current + 1)
          currentStack.push(currentEntry)
          entryIndexRef.current = currentStack.length - 1
        }
      }

      historyTraversalRef.current = false

      const nativeAvailability = readNativeHistoryAvailability()
      if (nativeAvailability) {
        setAvailability(nativeAvailability)
        return
      }

      setAvailability({
        canGoBack: entryIndexRef.current > 0,
        canGoForward: entryIndexRef.current < currentStack.length - 1,
      })
    },
    [enabled]
  )

  useEffect(() => {
    syncAvailability(currentEntryKey)
  }, [currentEntryKey, syncAvailability])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    const handlePopState = () => {
      historyTraversalRef.current = true
    }

    window.addEventListener('popstate', handlePopState)

    const navigationApi = (window as Window & { navigation?: NavigationApiLike }).navigation
    const handleCurrentEntryChange = () => {
      window.requestAnimationFrame(() => syncAvailability())
    }

    navigationApi?.addEventListener?.('currententrychange', handleCurrentEntryChange)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      navigationApi?.removeEventListener?.('currententrychange', handleCurrentEntryChange)
    }
  }, [enabled, syncAvailability])

  return availability
}

export function MacDesktopSidebarControls() {
  const isMacElectronShell = useIsMacElectronShell()
  const { canGoBack, canGoForward } = useDesktopHistoryAvailability(isMacElectronShell)

  const handleGoBack = useCallback(() => {
    if (canGoBack) {
      window.history.back()
    }
  }, [canGoBack])

  const handleGoForward = useCallback(() => {
    if (canGoForward) {
      window.history.forward()
    }
  }, [canGoForward])

  if (!isMacElectronShell) return null

  const buttonClass =
    'h-6 w-6 rounded-md border border-transparent p-0 text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:text-faint/50 disabled:hover:bg-transparent'

  // One title-bar row, the same height as the app top bar so their bottom
  // edges meet. The left 78px belongs to the native traffic lights
  // (see trafficLightPosition in apps/desktop/src/main.ts).
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-end bg-sidebar-background pl-[78px] pr-3 app-region-drag',
        APP_TOP_BAR_HEIGHT_CLASS
      )}
    >
      <TooltipProvider delayDuration={400}>
        <div className="flex items-center gap-0.5 app-region-no-drag">
          <Tooltip>
            {/* The wrapper keeps the tooltip reachable while the button is disabled. */}
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={buttonClass}
                  onClick={handleGoBack}
                  disabled={!canGoBack}
                  aria-label="Go back"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">Back</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={buttonClass}
                  onClick={handleGoForward}
                  disabled={!canGoForward}
                  aria-label="Go forward"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">Forward</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  )
}
