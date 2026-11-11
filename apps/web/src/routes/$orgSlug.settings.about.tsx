import { createFileRoute } from '@tanstack/react-router'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CopyButton, SettingsPage, useSettingsTopBar } from '@/components/settings/settings-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel, PanelHeader } from '@/components/ui/section'
import { useAppConfig } from '@/hooks/use-app-config'
import { useAppMode } from '@/hooks/use-app-mode'
import { APP_BUILD_INFO } from '@/lib/app-version'

export const Route = createFileRoute('/$orgSlug/settings/about')({
  component: AboutSettingsPage,
})

const BUILD_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatBuildTime(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : BUILD_TIME_FORMAT.format(date)
}

const STORAGE_LABELS: Record<string, string> = {
  postgres: 'PostgreSQL',
  pglite: 'Embedded database (PGlite)',
}

interface Fact {
  label: string
  value: string
  /** Machine values are set in mono and get a copy button. */
  mono?: boolean
  badge?: React.ReactNode
}

function AboutSettingsPage() {
  const { config } = useAppConfig()
  const { isAuthless } = useAppMode()
  const server = config.version
  const builtAt = formatBuildTime(APP_BUILD_INFO.buildTime ?? server.buildTime)
  const sameBuild =
    server.version === APP_BUILD_INFO.version && server.buildId === APP_BUILD_INFO.buildId

  useSettingsTopBar('About')

  const facts: Fact[] = [
    {
      label: 'Version',
      value: APP_BUILD_INFO.version,
      mono: true,
      badge: server.update.required ? (
        <Badge variant="warning">Update available</Badge>
      ) : (
        <Badge variant="success">Up to date</Badge>
      ),
    },
    { label: 'Build', value: APP_BUILD_INFO.buildId, mono: true },
    ...(builtAt ? [{ label: 'Built', value: builtAt, mono: true }] : []),
    ...(sameBuild
      ? []
      : [
          { label: 'Server version', value: server.version, mono: true },
          { label: 'Server build', value: server.buildId, mono: true },
        ]),
    { label: 'Release channel', value: server.releaseChannel, mono: true },
    {
      label: 'Deployment',
      value: config.telemetry.deployment === 'cloud' ? 'Durabull Cloud' : 'Self-hosted',
    },
    ...(config.persistence === 'unknown'
      ? []
      : [{ label: 'Storage', value: STORAGE_LABELS[config.persistence] ?? config.persistence }]),
    ...(isAuthless ? [{ label: 'Accounts', value: 'None. This install runs locally.' }] : []),
  ]

  const summary = facts.map((fact) => `${fact.label}: ${fact.value}`).join('\n')

  return (
    <SettingsPage
      title="This install"
      description="Include these details when you report a problem."
      actions={<CopyAllButton text={summary} />}
    >
      <Panel>
        <dl className="divide-y">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="flex min-h-10 items-center gap-3 px-4 py-1.5 text-[13px]"
            >
              <dt className="w-32 shrink-0 text-muted-foreground sm:w-40">{fact.label}</dt>
              <dd className="flex min-w-0 flex-1 items-center gap-2">
                <span className={fact.mono ? 'truncate font-mono tabular-nums' : 'truncate'}>
                  {fact.value}
                </span>
                {fact.badge}
              </dd>
              {fact.mono ? (
                <CopyButton value={fact.value} label={fact.label.toLowerCase()} />
              ) : null}
            </div>
          ))}
        </dl>
      </Panel>

      <Panel>
        <PanelHeader>
          <h3 className="flex items-center gap-2 text-[13px] font-semibold">
            Anonymous usage telemetry
            <Badge variant={config.telemetry.collectionRequired ? 'outline' : 'neutral'}>
              {config.telemetry.collectionRequired ? 'Required' : 'Optional'}
            </Badge>
          </h3>
          <a
            href={config.telemetry.disclosureUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Privacy details
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </PanelHeader>
        <dl className="divide-y text-[13px]">
          <div className="flex gap-3 px-4 py-2.5">
            <dt className="w-32 shrink-0 text-muted-foreground sm:w-40">Collected</dt>
            <dd className="min-w-0 flex-1">Which features are used, so we know what to improve.</dd>
          </div>
          <div className="flex gap-3 px-4 py-2.5">
            <dt className="w-32 shrink-0 text-muted-foreground sm:w-40">Never collected</dt>
            <dd className="min-w-0 flex-1">
              Redis URLs, queue names, Redis key names, job data, logs, emails, names,
              organizations, or raw error messages.
            </dd>
          </div>
        </dl>
      </Panel>
    </SettingsPage>
  )
}

function CopyAllButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timeout)
  }, [copied])

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={() => {
        if (!navigator.clipboard) {
          toast.error('Copying is unavailable here.')
          return
        }
        navigator.clipboard.writeText(text).then(
          () => setCopied(true),
          () => toast.error('Could not copy the details.')
        )
      }}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-status-success" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {copied ? 'Copied' : 'Copy details'}
    </Button>
  )
}
