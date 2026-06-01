import { createFileRoute } from '@tanstack/react-router'
import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react'
import { type ComponentType, useMemo } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/$orgSlug/settings/appearance')({
  component: AppearanceSettingsPage,
})

function AppearanceSettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Palette className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Settings</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">Appearance</span>
        </div>
      ),
    }),
    []
  )

  useAppTopBar(topBarConfig)

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Appearance</CardTitle>
              <CardDescription>Choose how Durabull looks for your account.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4" role="radiogroup" aria-label="Theme preference">
          <ThemeOption
            title="System"
            description={`Use your device preference (currently ${resolvedTheme}).`}
            icon={Monitor}
            isActive={theme === 'system'}
            onClick={() => setTheme('system')}
          />
          <ThemeOption
            title="Dark"
            description="Use dark mode."
            icon={Moon}
            isActive={theme === 'dark'}
            onClick={() => setTheme('dark')}
          />
          <ThemeOption
            title="Light"
            description="Use light mode."
            icon={Sun}
            isActive={theme === 'light'}
            onClick={() => setTheme('light')}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function ThemeOption({
  title,
  description,
  icon: Icon,
  isActive,
  onClick,
}: {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  isActive: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      role="radio"
      aria-checked={isActive}
      onClick={onClick}
      className={cn(
        'h-auto w-full justify-between rounded-lg border p-4 text-left',
        isActive && 'border-primary bg-primary/5'
      )}
    >
      <span className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </span>
        <span>
          <span className="block text-sm font-medium text-foreground">{title}</span>
          <span className="block text-sm font-normal text-muted-foreground">{description}</span>
        </span>
      </span>
      {isActive ? <Check className="h-4 w-4 text-primary" /> : null}
    </Button>
  )
}
