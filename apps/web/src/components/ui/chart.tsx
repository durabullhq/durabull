import * as React from 'react'
import * as RechartsPrimitive from 'recharts'
import { cn } from '@/lib/utils'

const THEMES = {
  light: '',
  dark: '.dark',
} as const

type ChartTheme = keyof typeof THEMES

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | {
        color?: string
        theme?: never
      }
    | {
        color?: never
        theme: Record<ChartTheme, string>
      }
  )
>

interface ChartContextValue {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextValue | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />')
  }

  return context
}

interface ChartContainerProps extends React.ComponentProps<'div'> {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children']
}

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ id, className, children, config, ...props }, ref) => {
    const uniqueId = React.useId()
    const chartId = `chart-${id ?? uniqueId.replace(/:/g, '')}`

    return (
      <ChartContext.Provider value={{ config }}>
        <div
          data-chart={chartId}
          ref={ref}
          className={cn(
            'flex h-[320px] w-full items-center justify-center text-xs',
            // Axis: 11px mono in the muted ink; no tick or axis strokes beyond the hairline grid.
            '[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-axis-tick_text]:font-mono [&_.recharts-cartesian-axis-tick_text]:text-[11px]',
            '[&_.recharts-cartesian-axis-line]:stroke-border [&_.recharts-cartesian-axis-tick-line]:stroke-border',
            '[&_.recharts-cartesian-grid_line]:stroke-border',
            '[&_.recharts-polar-grid_line]:stroke-border',
            // Hover cursor: a stronger hairline for lines, a quiet band for bars.
            '[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border-strong',
            '[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted',
            '[&_.recharts-reference-line_[stroke="#ccc"]]:stroke-border-strong',
            '[&_.recharts-reference-line_text]:fill-muted-foreground [&_.recharts-reference-line_text]:font-mono [&_.recharts-reference-line_text]:text-[10px]',
            '[&_.recharts-dot[stroke="#fff"]]:stroke-transparent',
            '[&_.recharts-active-dot_circle]:stroke-card',
            '[&_.recharts-sector]:outline-none [&_.recharts-layer]:outline-none [&_.recharts-surface]:outline-none',
            className
          )}
          {...props}
        >
          <ChartStyle id={chartId} config={config} />
          <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    )
  }
)
ChartContainer.displayName = 'ChartContainer'

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorEntries = Object.entries(config).filter(([, item]) => item.color || item.theme)

  if (!colorEntries.length) {
    return null
  }

  const css = Object.entries(THEMES)
    .map(([theme, prefix]) => {
      const colorStyles = colorEntries
        .map(([key, item]) => {
          const color = item.theme?.[theme as ChartTheme] ?? item.color
          return color ? `  --color-${key}: ${color};` : null
        })
        .filter(Boolean)
        .join('\n')

      return `${prefix} [data-chart="${id}"] {\n${colorStyles}\n}`
    })
    .join('\n')

  return <style>{css}</style>
}

const ChartTooltip = RechartsPrimitive.Tooltip
const ChartLegend = RechartsPrimitive.Legend

type TooltipEntry = {
  color?: string
  dataKey?: string | number
  name?: string | number
  value?: number | string
  payload?: Record<string, unknown>
}

interface ChartTooltipContentProps extends React.ComponentProps<'div'> {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  formatter?: (
    value: number | string,
    name: string,
    item: TooltipEntry,
    index: number,
    payload: TooltipEntry[]
  ) => React.ReactNode
  labelFormatter?: (label: string | number, payload: TooltipEntry[]) => React.ReactNode
  hideLabel?: boolean
  hideIndicator?: boolean
}

const ChartTooltipContent = React.forwardRef<HTMLDivElement, ChartTooltipContentProps>(
  (
    {
      active,
      payload,
      className,
      formatter,
      label,
      labelFormatter,
      hideLabel = false,
      hideIndicator = false,
    },
    ref
  ) => {
    const { config } = useChart()

    if (!active || !payload?.length) {
      return null
    }

    const tooltipLabel =
      !hideLabel && label
        ? labelFormatter
          ? labelFormatter(label, payload)
          : typeof label === 'number'
            ? label.toString()
            : label
        : null

    return (
      <div
        ref={ref}
        className={cn(
          'grid min-w-[10rem] items-start gap-1.5 rounded-md border bg-popover px-2.5 py-2 text-popover-foreground shadow-lg',
          className
        )}
      >
        {tooltipLabel ? (
          <div className="border-b pb-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
            {tooltipLabel}
          </div>
        ) : null}
        <div className="grid gap-1">
          {payload.map((item, index) => {
            const configKey = String(item.dataKey ?? item.name ?? '')
            const itemConfig = config[configKey]
            const itemLabel = itemConfig?.label ?? item.name ?? configKey
            const itemColor =
              item.color ?? (configKey ? `var(--color-${configKey})` : 'currentColor')
            const value = typeof item.value === 'number' ? item.value.toLocaleString() : item.value

            return (
              <div
                key={`${configKey}-${index}`}
                className="flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  {hideIndicator ? null : (
                    <span
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: itemColor }}
                      aria-hidden
                    />
                  )}
                  <span className="text-xs">{itemLabel}</span>
                </div>
                <span className="font-mono text-xs font-medium tabular-nums text-foreground">
                  {formatter && item.value !== undefined
                    ? formatter(item.value, String(item.name ?? configKey), item, index, payload)
                    : value}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
ChartTooltipContent.displayName = 'ChartTooltipContent'

interface LegendEntry {
  color?: string
  dataKey?: string
  value?: string
  /** Recharts legend type; `none` marks a series that opted out of the legend. */
  type?: string
}

interface ChartLegendContentProps extends React.ComponentProps<'div'> {
  payload?: LegendEntry[]
  hideIcon?: boolean
}

const ChartLegendContent = React.forwardRef<HTMLDivElement, ChartLegendContentProps>(
  ({ className, payload, hideIcon = false }, ref) => {
    const { config } = useChart()

    const items = payload?.filter((item) => item.type !== 'none') ?? []

    if (!items.length) {
      return null
    }

    return (
      <div
        ref={ref}
        className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2', className)}
      >
        {items.map((item) => {
          const configKey = item.dataKey ?? item.value ?? ''
          const itemConfig = config[configKey]

          return (
            <div
              key={configKey}
              className="flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground"
            >
              {hideIcon ? null : (
                <span
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: item.color ?? `var(--color-${configKey})` }}
                  aria-hidden
                />
              )}
              <span>{itemConfig?.label ?? item.value}</span>
            </div>
          )
        })}
      </div>
    )
  }
)
ChartLegendContent.displayName = 'ChartLegendContent'

export { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent }
