import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, Cable, Compass, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAppMode } from '@/hooks/use-app-mode'
import { cn } from '@/lib/utils'

interface NoConnectionConfiguredProps {
  orgSlug: string
  area: string
  icon: LucideIcon
  description?: string
}

const shellTransition = { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const }

export function NoConnectionConfigured({
  orgSlug,
  area,
  icon: AreaIcon,
  description,
}: NoConnectionConfiguredProps) {
  const { envConnections } = useAppMode()

  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <AreaIcon className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">{area}</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">
            Connection required before this workspace can load
          </span>
        </div>
      ),
      actions: (
        <Button asChild size="xs" className="gap-2">
          <Link
            to="/$orgSlug/connections"
            params={{ orgSlug }}
            search={envConnections ? undefined : { create: 1 }}
          >
            {envConnections ? 'Open Setup Guide' : 'Add Connection'}
          </Link>
        </Button>
      ),
    }),
    [area, envConnections, orgSlug]
  )

  useAppTopBar(topBarConfig)

  const bodyCopy =
    description ??
    (envConnections
      ? `This environment is configured for env-driven Redis connections. Add the required DURABULL_REDIS_URL_* values, restart the app, and ${area.toLowerCase()} will come online.`
      : `Durabull needs a Redis connection before ${area.toLowerCase()} can inspect queues, workers, schedulers, or Redis data.`)

  return (
    <motion.div
      className="relative isolate overflow-hidden rounded-[30px] border border-border/70 bg-card/85 shadow-[0_25px_90px_-55px_rgba(15,23,42,0.55)]"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shellTransition}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_30%),radial-gradient(circle_at_80%_18%,rgba(251,191,36,0.14),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.04),transparent_55%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_80%_18%,rgba(251,191,36,0.18),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.3),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:32px_32px]" />

      <div className="relative grid gap-8 px-6 py-8 sm:px-8 sm:py-10 xl:grid-cols-[1.15fr_0.85fr] xl:px-10">
        <div className="space-y-6">
          <motion.div
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground shadow-sm backdrop-blur"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...shellTransition, delay: 0.05 }}
          >
            <Sparkles className="h-3.5 w-3.5 text-status-warning" />
            Connection Required
          </motion.div>

          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...shellTransition, delay: 0.1 }}
          >
            <h2
              className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
              style={{
                fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif',
              }}
            >
              No connection configured
            </h2>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">{bodyCopy}</p>
          </motion.div>

          <motion.div
            className="flex flex-wrap gap-3"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...shellTransition, delay: 0.15 }}
          >
            <Button asChild className="gap-2">
              <Link
                to="/$orgSlug/connections"
                params={{ orgSlug }}
                search={envConnections ? undefined : { create: 1 }}
              >
                {envConnections ? 'Review connection setup' : 'Add your first connection'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/$orgSlug" params={{ orgSlug }} search={{ onboarding: 1 }}>
                Open onboarding
              </Link>
            </Button>
          </motion.div>

          <motion.div
            className="grid gap-3 md:grid-cols-3"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...shellTransition, delay: 0.2 }}
          >
            {[
              {
                icon: Cable,
                label: envConnections ? 'Wire env vars' : 'Connect Redis',
                copy: envConnections
                  ? 'Provide the Redis URLs Durabull should mount at boot.'
                  : 'Attach the Redis instance that powers your BullMQ queues.',
                gradient: 'from-status-active/18 via-status-active/6 to-transparent',
              },
              {
                icon: AreaIcon,
                label: `Unlock ${area}`,
                copy: `${area} comes online automatically once a connection is available.`,
                gradient: 'from-status-success/18 via-status-success/6 to-transparent',
              },
              {
                icon: Compass,
                label: 'Return to onboarding',
                copy: 'Reopen the guided setup if you want the full checklist again.',
                gradient: 'from-status-warning/18 via-status-warning/6 to-transparent',
              },
            ].map((item, index) => (
              <Card
                key={item.label}
                className={cn(
                  'overflow-hidden border bg-background/78 backdrop-blur',
                  'shadow-[0_18px_55px_-42px_rgba(15,23,42,0.9)]'
                )}
              >
                <CardContent className="relative p-4">
                  <div
                    className={cn('absolute inset-0 bg-gradient-to-br opacity-80', item.gradient)}
                  />
                  <motion.div
                    className="relative space-y-3"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...shellTransition, delay: 0.24 + index * 0.06 }}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/30 bg-white/60 text-foreground shadow-sm dark:border-white/10 dark:bg-white/5">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="text-sm leading-6 text-muted-foreground">{item.copy}</p>
                    </div>
                  </motion.div>
                </CardContent>
              </Card>
            ))}
          </motion.div>
        </div>

        <motion.div
          className="relative"
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...shellTransition, delay: 0.14 }}
        >
          <div className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-foreground/[0.08] via-transparent to-transparent blur-3xl" />
          <Card className="relative overflow-hidden rounded-[28px] border border-border/70 bg-background/82 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.95)] backdrop-blur">
            <CardContent className="space-y-6 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Control Plane
                  </p>
                  <p className="text-xl font-semibold text-foreground">Stand up your first link</p>
                </div>
                <span className="rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {area}
                </span>
              </div>

              <div className="space-y-4">
                {[
                  'Redis credentials validated',
                  'Queue discovery indexed',
                  'Platform surfaces unlocked',
                ].map((label, index) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/40">
                      <span className="text-sm font-semibold text-foreground">0{index + 1}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/60">
                        <motion.div
                          className={cn(
                            'h-full rounded-full',
                            index === 0 && 'bg-status-active/65',
                            index === 1 && 'bg-status-success/60',
                            index === 2 && 'bg-status-warning/65'
                          )}
                          initial={{ width: 0 }}
                          animate={{ width: `${52 + index * 16}%` }}
                          transition={{ duration: 1, delay: 0.35 + index * 0.12 }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[24px] border border-border/70 bg-muted/35 p-4">
                <p className="text-sm font-medium text-foreground">
                  The moment a connection is added, Durabull can resolve queues, workers, schedules,
                  and Redis keys without another setup step.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}
