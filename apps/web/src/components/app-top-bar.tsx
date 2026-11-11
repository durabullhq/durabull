import { Menu, MoreHorizontal } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react'
import { FullscreenToggle } from '@/components/fullscreen-toggle'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useIsElectronShell } from '@/hooks/use-electron-shell'
import { cn } from '@/lib/utils'

/** Shared by the top bar and the sidebar's first row so their bottom edges align. */
export const APP_TOP_BAR_HEIGHT_CLASS = 'h-12'

export interface AppTopBarConfig {
  left?: React.ReactNode
  actions?: React.ReactNode
  mobileActions?: React.ReactNode
}

interface AppTopBarContextValue {
  registerConfig: (id: string, config: AppTopBarConfig) => void
  unregisterConfig: (id: string) => void
}

const DEFAULT_TOP_BAR_CONFIG: AppTopBarConfig = {}

const AppTopBarControlContext = createContext<AppTopBarContextValue | null>(null)
const AppTopBarStateContext = createContext<AppTopBarConfig>(DEFAULT_TOP_BAR_CONFIG)

function useAppTopBarContext() {
  const context = useContext(AppTopBarControlContext)
  if (!context) {
    throw new Error('useAppTopBar must be used within AppTopBarProvider')
  }
  return context
}

export function AppTopBarProvider({ children }: { children: React.ReactNode }) {
  const [configStack, setConfigStack] = useState<Array<{ id: string; config: AppTopBarConfig }>>([])

  const registerConfig = useCallback((id: string, config: AppTopBarConfig) => {
    setConfigStack((previous) => {
      const existingIndex = previous.findIndex((entry) => entry.id === id)
      if (existingIndex === -1) {
        return [...previous, { id, config }]
      }

      return previous.map((entry, index) => (index === existingIndex ? { id, config } : entry))
    })
  }, [])

  const unregisterConfig = useCallback((id: string) => {
    setConfigStack((previous) => previous.filter((entry) => entry.id !== id))
  }, [])

  const activeConfig =
    configStack.length > 0 ? configStack[configStack.length - 1].config : DEFAULT_TOP_BAR_CONFIG

  const value = useMemo(
    () => ({
      registerConfig,
      unregisterConfig,
    }),
    [registerConfig, unregisterConfig]
  )

  return (
    <AppTopBarControlContext.Provider value={value}>
      <AppTopBarStateContext.Provider value={activeConfig}>
        {children}
      </AppTopBarStateContext.Provider>
    </AppTopBarControlContext.Provider>
  )
}

export function useAppTopBar(config: AppTopBarConfig) {
  const id = useId()
  const { registerConfig, unregisterConfig } = useAppTopBarContext()

  useEffect(() => {
    registerConfig(id, config)

    return () => {
      unregisterConfig(id)
    }
  }, [config, id, registerConfig, unregisterConfig])
}

export function AppTopBar({
  onOpenMobileNav,
  className,
}: {
  onOpenMobileNav: () => void
  className?: string
}) {
  const { left, actions, mobileActions } = useContext(AppTopBarStateContext)
  const isElectronShell = useIsElectronShell()

  return (
    <header
      className={cn(
        `${APP_TOP_BAR_HEIGHT_CLASS} shrink-0 border-b bg-background`,
        isElectronShell && 'app-region-drag',
        className
      )}
    >
      <div
        className={cn(
          'flex h-full items-center justify-between gap-3 px-4 md:px-5',
          isElectronShell && 'pointer-events-none'
        )}
      >
        <div
          className={cn(
            'min-w-0 flex items-center gap-1.5 md:gap-2.5',
            isElectronShell && 'pointer-events-none'
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpenMobileNav}
            className={cn(
              '-ml-1.5 md:hidden',
              isElectronShell && 'pointer-events-auto app-region-no-drag'
            )}
            aria-label="Open navigation menu"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div
            className={cn(
              'min-w-0',
              // Links and controls in the title stay clickable inside the drag region.
              isElectronShell &&
                '[&_a]:pointer-events-auto [&_a]:[-webkit-app-region:no-drag] [&_button]:pointer-events-auto [&_button]:[-webkit-app-region:no-drag]'
            )}
          >
            {left ?? <div className="h-6" />}
          </div>
        </div>

        <div
          className={cn(
            'ml-auto hidden items-center gap-2 md:flex',
            isElectronShell && 'pointer-events-auto app-region-no-drag'
          )}
        >
          {actions}
          <FullscreenToggle />
        </div>

        <div
          className={cn(
            'flex items-center md:hidden',
            isElectronShell && 'pointer-events-auto app-region-no-drag'
          )}
        >
          <FullscreenToggle />
          {mobileActions ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open page actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {mobileActions}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  )
}
