import { createFileRoute } from '@tanstack/react-router'
import { BarChart3, ExternalLink, Info } from 'lucide-react'
import { useMemo } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppConfig } from '@/hooks/use-app-config'
import { APP_BUILD_INFO } from '@/lib/app-version'

export const Route = createFileRoute('/$orgSlug/settings/about')({
  component: AboutSettingsPage,
})

function AboutSettingsPage() {
  const { config } = useAppConfig()
  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Info className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Settings</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">About</span>
        </div>
      ),
    }),
    []
  )

  useAppTopBar(topBarConfig)

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="border-muted bg-muted/20">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Anonymous usage telemetry</CardTitle>
              <CardDescription>Understand what usage data Durabull collects.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {config.telemetry.collectionRequired ? (
              <Badge variant="outline" className="text-[10px]">
                Required
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                Optional
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Durabull collects anonymous usage telemetry to understand feature usage and improve the
            product. We do not collect Redis URLs, queue names, Redis key names, job data, logs,
            emails, names, organizations, or raw error messages.
          </p>
          <a
            href={config.telemetry.disclosureUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Privacy details
            <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>

      <p className="px-1 text-right text-[11px] text-muted-foreground/70">
        Durabull v{APP_BUILD_INFO.version}
      </p>
    </div>
  )
}
