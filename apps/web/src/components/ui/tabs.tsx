import * as React from 'react'
import { cn } from '@/lib/utils'

interface TabsContextValue {
  value: string
  onChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined)

/** Container for a row of segments: `TabsList`, or any one-of-n button group. */
export const SEGMENTED_GROUP_CLASS =
  'inline-flex h-8 items-center gap-0.5 rounded-md border bg-muted p-0.5 text-muted-foreground'

/**
 * Classes for one segment in a segmented control. Use it for any one-of-n
 * choice rendered as buttons (filters, modes, intervals) so the selected state
 * looks the same everywhere. Pass size overrides through `className`.
 */
export function segmentedItemClass(selected: boolean, className?: string) {
  return cn(
    'inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50',
    selected && 'bg-card text-foreground shadow-sm ring-1 ring-border',
    className
  )
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  onValueChange: (value: string) => void
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ className, value, onValueChange, ...props }, ref) => (
    <TabsContext.Provider value={{ value, onChange: onValueChange }}>
      <div ref={ref} className={cn('', className)} {...props} />
    </TabsContext.Provider>
  )
)
Tabs.displayName = 'Tabs'

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cn(SEGMENTED_GROUP_CLASS, 'justify-center'), className)}
      {...props}
    />
  )
)
TabsList.displayName = 'TabsList'

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, onClick, children, ...props }, ref) => {
    const context = React.useContext(TabsContext)
    const isSelected = context?.value === value

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      context?.onChange(value)
      onClick?.(e)
    }

    return (
      <button
        ref={ref}
        type="button"
        {...props}
        className={segmentedItemClass(isSelected, cn('px-2.5 ring-offset-background', className))}
        onClick={handleClick}
      >
        {children}
      </button>
    )
  }
)
TabsTrigger.displayName = 'TabsTrigger'

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, ...props }, ref) => {
    const context = React.useContext(TabsContext)
    if (context?.value !== value) return null

    return (
      <div
        ref={ref}
        className={cn(
          'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          className
        )}
        {...props}
      />
    )
  }
)
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
