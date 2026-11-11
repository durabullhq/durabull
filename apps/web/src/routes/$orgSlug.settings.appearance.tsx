import { createFileRoute } from '@tanstack/react-router'
import { type LucideIcon, Monitor, Moon, Sun } from 'lucide-react'
import { SettingsPage, useSettingsTopBar } from '@/components/settings/settings-layout'
import { useTheme } from '@/components/theme-provider'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/$orgSlug/settings/appearance')({
  component: AppearanceSettingsPage,
})

type Scheme = 'light' | 'dark'

const THEME_OPTIONS: { value: Scheme | 'system'; title: string; icon: LucideIcon }[] = [
  { value: 'light', title: 'Light', icon: Sun },
  { value: 'dark', title: 'Dark', icon: Moon },
  { value: 'system', title: 'System', icon: Monitor },
]

function AppearanceSettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme()

  useSettingsTopBar('Appearance')

  return (
    <SettingsPage title="Theme" description="Saved in this browser.">
      <div role="radiogroup" aria-label="Theme preference" className="grid gap-3 sm:grid-cols-3">
        {THEME_OPTIONS.map((option) => {
          const isActive = theme === option.value
          const Icon = option.icon

          return (
            // biome-ignore lint/a11y/useSemanticElements: a tile with a preview cannot be a native radio input
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setTheme(option.value)}
              className={cn(
                'flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                isActive && 'border-foreground hover:border-foreground'
              )}
            >
              <span className="block border-b bg-muted/50 p-3" aria-hidden>
                {option.value === 'system' ? (
                  <span className="grid grid-cols-2 overflow-hidden rounded-md">
                    <ThemePreview scheme="light" current={resolvedTheme} half="left" />
                    <ThemePreview scheme="dark" current={resolvedTheme} half="right" />
                  </span>
                ) : (
                  <ThemePreview scheme={option.value} current={resolvedTheme} />
                )}
              </span>
              <span className="flex min-h-[52px] flex-1 items-center gap-2 px-3 py-2">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-foreground">
                    {option.title}
                  </span>
                  {option.value === 'system' ? (
                    <span className="block text-xs text-muted-foreground">
                      Follows your device, now {resolvedTheme}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border-strong',
                    isActive && 'border-foreground'
                  )}
                  aria-hidden
                >
                  {isActive ? <span className="h-2 w-2 rounded-full bg-foreground" /> : null}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </SettingsPage>
  )
}

/**
 * Miniature of the console in one colour scheme. The scheme that is on screen
 * is drawn with the surface tokens; the other one swaps ink and paper
 * (`foreground` as the surface, `background` as the ink), so both previews
 * come from tokens and stay correct when the palette changes.
 */
function ThemePreview({
  scheme,
  current,
  half,
}: {
  scheme: Scheme
  current: Scheme
  /** Render one half of a split preview (the System tile). */
  half?: 'left' | 'right'
}) {
  const inverted = scheme !== current
  const line = inverted ? 'bg-background/25' : 'bg-foreground/20'
  const faintLine = inverted ? 'bg-background/12' : 'bg-foreground/10'
  const hairline = inverted ? 'border-background/15' : 'border-border'

  return (
    <span
      className={cn(
        'flex h-24 overflow-hidden border',
        hairline,
        inverted ? 'bg-foreground' : 'bg-background',
        half === 'left' && 'rounded-l-md border-r-0',
        half === 'right' && 'rounded-r-md',
        !half && 'rounded-md'
      )}
    >
      {half === 'right' ? null : (
        <span className={cn('flex w-1/4 min-w-8 flex-col gap-1.5 border-r p-2', hairline)}>
          <span className="h-1.5 w-1.5 rounded-full bg-signal" />
          <span className={cn('h-1 w-full rounded-full', line)} />
          <span className={cn('h-1 w-4/5 rounded-full', faintLine)} />
          <span className={cn('h-1 w-full rounded-full', faintLine)} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 p-2">
        <span className={cn('h-1 w-1/3 rounded-full', line)} />
        <span
          className={cn(
            'flex flex-1 flex-col justify-center gap-1.5 rounded-[4px] border px-2',
            hairline,
            // The raised surface: a touch lighter than the page in either scheme.
            !inverted ? 'bg-card' : current === 'dark' ? 'bg-primary' : 'bg-background/5'
          )}
        >
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-status-success" />
            <span className={cn('h-1 w-3/5 rounded-full', line)} />
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-status-danger" />
            <span className={cn('h-1 w-2/5 rounded-full', faintLine)} />
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-status-warning" />
            <span className={cn('h-1 w-1/2 rounded-full', faintLine)} />
          </span>
        </span>
      </span>
    </span>
  )
}
