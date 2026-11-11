import { Link, useLocation, useParams } from '@tanstack/react-router'
import { Check, Copy, HardDrive } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { type AppTopBarConfig, useAppTopBar } from '@/components/app-top-bar'
import { PageTitle } from '@/components/page-title'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppMode } from '@/hooks/use-app-mode'
import { cn } from '@/lib/utils'

interface SettingsLayoutProps {
  orgSlug: string
  children: React.ReactNode
}

interface SettingsNavItem {
  label: string
  to: string
  hidden?: boolean
}

interface SettingsNavGroup {
  label: string
  items: SettingsNavItem[]
}

/**
 * Settings shell: a slim secondary rail next to the content column. Below `xl`
 * the same links become a scrollable tab row under the top bar, so there is
 * one nav in the DOM at every width.
 */
export function SettingsLayout({ orgSlug, children }: SettingsLayoutProps) {
  const { isAuthless, billingEnabled } = useAppMode()
  const { pathname } = useLocation()
  const groupId = useId()
  const navRef = useRef<HTMLElement>(null)

  // As a tab row the nav scrolls sideways; keep the current section in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the route changes
  useEffect(() => {
    const nav = navRef.current
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !current) return
    nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2
  }, [pathname])
  const basePath = `/${orgSlug}/settings`

  // A local install has no accounts, so everything about people and sign-in is left out.
  const groups: SettingsNavGroup[] = [
    {
      label: 'Workspace',
      items: [
        { label: 'Connections', to: `${basePath}/connections` },
        { label: 'Team', to: `${basePath}/team`, hidden: isAuthless },
        { label: 'Service accounts', to: `${basePath}/service-accounts`, hidden: isAuthless },
        { label: 'Billing', to: `${basePath}/billing`, hidden: !billingEnabled },
      ],
    },
    {
      label: 'Alerting',
      items: [
        { label: 'Alert destinations', to: `${basePath}/destinations` },
        { label: 'Integrations', to: `${basePath}/integrations` },
      ],
    },
    {
      label: 'Security',
      items: [{ label: 'Authentication', to: `${basePath}/authentication`, hidden: isAuthless }],
    },
    {
      label: 'Preferences',
      items: [
        { label: 'Appearance', to: `${basePath}/appearance` },
        { label: 'About', to: `${basePath}/about` },
      ],
    },
  ]

  return (
    <div className="flex min-h-full flex-col gap-4 xl:flex-row xl:gap-8">
      <nav
        ref={navRef}
        aria-label="Settings"
        // The tab row cancels the page padding so it sits flush under the top bar and its
        // first label lines up with the content below it.
        className="sticky top-0 z-10 -mx-4 -mt-4 shrink-0 overflow-x-auto border-b bg-background px-1.5 [scrollbar-width:none] md:-mx-5 md:-mt-5 md:px-2.5 xl:top-5 xl:z-auto xl:m-0 xl:w-[200px] xl:self-start xl:overflow-visible xl:border-b-0 xl:bg-transparent xl:px-0 [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex xl:flex-col xl:gap-5">
          {groups.map((group, index) => {
            const items = group.items.filter((item) => !item.hidden)
            if (items.length === 0) return null
            const labelId = `${groupId}-${index}`

            return (
              // biome-ignore lint/a11y/useSemanticElements: a labelled group of links, not a form fieldset
              <div
                key={group.label}
                role="group"
                aria-labelledby={labelId}
                className="flex xl:flex-col xl:gap-px"
              >
                <span id={labelId} className="eyebrow hidden px-2.5 pb-1.5 xl:block">
                  {group.label}
                </span>
                {items.map((item) => {
                  const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`)

                  return (
                    <Link
                      key={item.label}
                      to={item.to}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'relative flex h-10 shrink-0 items-center whitespace-nowrap px-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 xl:h-8 xl:rounded-md xl:hover:bg-accent',
                        isActive &&
                          'font-medium text-foreground after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:bg-foreground xl:bg-accent xl:after:hidden'
                      )}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </div>
      </nav>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  )
}

/**
 * Registers the top bar for a settings page: `Settings › <section>`. Pass
 * memoised nodes for `meta`, `actions` and `mobileActions`.
 */
export function useSettingsTopBar(
  title: string,
  { meta, actions, mobileActions }: { meta?: React.ReactNode } & Omit<AppTopBarConfig, 'left'> = {}
) {
  const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string }
  const config = useMemo(
    () => ({
      left: (
        <PageTitle
          title={title}
          crumbs={[{ label: 'Settings', to: orgSlug ? `/${orgSlug}/settings` : undefined }]}
          meta={meta}
        />
      ),
      actions,
      mobileActions,
    }),
    [title, orgSlug, meta, actions, mobileActions]
  )

  useAppTopBar(config)
}

/**
 * Content column for one settings page: a heading row that carries the page's
 * primary action, then its panels. Forms cap at a reading width; pass `wide`
 * for pages whose main content is a table.
 */
export function SettingsPage({
  title,
  count,
  description,
  actions,
  wide = false,
  className,
  children,
  ...props
}: {
  title: string
  count?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  wide?: boolean
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <div className={cn('space-y-4', wide ? 'max-w-6xl' : 'max-w-4xl', className)} {...props}>
      <SectionHeader title={title} count={count} description={description} actions={actions} />
      {children}
    </div>
  )
}

/**
 * Icon button that copies a machine value (URL, token, build id) and confirms
 * in place with a check mark.
 */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string
  /** What is being copied, e.g. "connection URL". Used for the accessible name. */
  label: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timeout)
  }, [copied])

  const copy = () => {
    if (!navigator.clipboard) {
      toast.error('Copying is unavailable here. Select the value and copy it manually.')
      return
    }
    navigator.clipboard.writeText(value).then(
      () => setCopied(true),
      () => toast.error('Could not copy. Select the value and copy it manually.')
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={copy}
            aria-label={`Copy ${label}`}
            className={cn(
              'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              className
            )}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-status-success" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied' : `Copy ${label}`}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Shown when a page that manages people or sign-in is opened on an install
 * that has no accounts (the desktop app, single-user self-hosting).
 */
export function LocalInstallNotice() {
  return (
    <EmptyState
      icon={HardDrive}
      title="No accounts on this install"
      description="This install runs locally without accounts, so team and sign-in settings do not apply."
      className="max-w-4xl"
    />
  )
}
