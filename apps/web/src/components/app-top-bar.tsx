import { Menu, MoreHorizontal } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FullscreenToggle } from '@/components/fullscreen-toggle'
import { useIsElectronShell } from '@/hooks/use-electron-shell'
import { cn } from '@/lib/utils'

export const APP_TOP_BAR_HEIGHT_CLASS = 'h-14'

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
        `${APP_TOP_BAR_HEIGHT_CLASS} shrink-0 border-b border-border/80 bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75`,
        isElectronShell && 'app-region-drag',
        className
      )}
    >
      <div
        className={cn(
          'flex h-full items-center justify-between gap-2 px-4 md:px-6',
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
            className={cn('md:hidden', isElectronShell && 'pointer-events-auto app-region-no-drag')}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className={cn('min-w-0', isElectronShell && 'pointer-events-none')}>
            {left ?? <div className="h-6" />}
          </div>
        </div>

        <div
          className={cn(
            'ml-auto hidden items-center gap-1.5 md:flex',
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
                  <MoreHorizontal className="h-5 w-5" />
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
