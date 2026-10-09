'use client'

import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
import { Check, CornerDownLeft, Loader2 } from 'lucide-react'
import type { ComponentType } from 'react'
import { useEffect, useRef, useState } from 'react'
import { DurabullLogo } from '@/components/durabull-logo'
import { cn } from '@/lib/utils'
import { ClaudeMark, OpenAIMark } from './brand-marks'
import { UserMsg } from './primitives'
import { type ExplorerView, QueueExplorer } from './queue-explorer'

interface Scenario {
  id: string
  label: string
  prompt: string
  tools: string[]
  answer: string
  view: ExplorerView
}

const scenarios: Scenario[] = [
  {
    id: 'triage',
    label: 'Triage a failure',
    prompt: 'Why is email:receipts failing in production?',
    tools: ['get_connection_overview', 'list_jobs', 'explain_job_failure'],
    answer:
      '7 receipts failed in the last hour, all for the same reason: your SMTP provider is rate-limiting sends (421 4.7.0). Confidence is high. It’s the failure reason on every attempt, and it matches the open “Receipt delivery failures” alert.',
    view: 'investigation',
  },
  {
    id: 'health',
    label: 'Check fleet health',
    prompt: 'How’s production looking this morning?',
    tools: ['get_connection_overview', 'get_redis_health'],
    answer:
      'Mostly healthy. 12 workers are processing, but email:receipts has 128 waiting and 7 failed. Redis memory is at 64%, under your 80% threshold.',
    view: 'overview',
  },
  {
    id: 'incidents',
    label: 'Review incidents',
    prompt: 'Any open incidents? Snooze the noisy rule for an hour.',
    tools: ['get_alert_summary', 'list_alert_rules'],
    answer:
      'Two open incidents, both from “Receipt delivery failures”. Snoozing is a change, so I’ll check first: snooze that rule for 60 minutes?',
    view: 'incidents',
  },
]

interface HostSkin {
  id: string
  name: string
  Mark: ComponentType<{ className?: string }>
  dark: boolean
}

const hosts: HostSkin[] = [
  { id: 'claude', name: 'Claude', Mark: ClaudeMark, dark: false },
  { id: 'chatgpt', name: 'ChatGPT', Mark: OpenAIMark, dark: true },
  { id: 'cowork', name: 'Cowork', Mark: ClaudeMark, dark: false },
]

/* step timeline: 1 prompt → 2..(1+n) tools → answer → app */
function useScenarioClock(active: boolean, toolCount: number, key: string) {
  const reduceMotion = useReducedMotion()
  const total = toolCount + 3
  const [step, setStep] = useState(reduceMotion ? total : 0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` restarts the clock per scenario
  useEffect(() => {
    setStep(reduceMotion ? total : 0)
  }, [key, reduceMotion, total])

  useEffect(() => {
    if (!active || step >= total) return
    const delay = step === 0 ? 350 : step <= toolCount ? 650 : 750
    const t = setTimeout(() => setStep((s) => s + 1), delay)
    return () => clearTimeout(t)
  }, [active, step, total, toolCount])

  return { step, done: step >= total, total }
}

export function AgentDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '-120px' })
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [hostIndex, setHostIndex] = useState(0)
  const [pinned, setPinned] = useState(false)
  const scenario = scenarios[scenarioIndex]
  const host = hosts[hostIndex]
  const { step, done } = useScenarioClock(inView, scenario.tools.length, scenario.id)

  // auto-advance through scenarios until the visitor takes control
  useEffect(() => {
    if (!done || pinned || !inView) return
    const t = setTimeout(() => {
      setScenarioIndex((i) => (i + 1) % scenarios.length)
      setHostIndex((i) => (i + 1) % hosts.length)
    }, 6500)
    return () => clearTimeout(t)
  }, [done, pinned, inView])

  const toolsShown = Math.max(0, Math.min(step - 1, scenario.tools.length))
  const showAnswer = step >= scenario.tools.length + 2
  const showApp = step >= scenario.tools.length + 3

  return (
    <div ref={ref} className="mx-auto max-w-4xl">
      {/* scenario switcher */}
      <fieldset className="mb-5 flex flex-wrap items-center justify-center gap-2">
        <legend className="sr-only">Example conversation</legend>
        {scenarios.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={i === scenarioIndex}
            onClick={() => {
              setPinned(true)
              setScenarioIndex(i)
            }}
            className={cn(
              'relative rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors',
              i === scenarioIndex
                ? 'border-[var(--v2-fg)] bg-[var(--v2-fg)] text-[var(--v2-bg)]'
                : 'border-[var(--v2-line-strong)] bg-[var(--v2-card)] text-[var(--v2-muted)] hover:text-[var(--v2-fg)]'
            )}
          >
            {s.label}
          </button>
        ))}
      </fieldset>

      <div className={cn('rounded-[20px] transition-colors duration-500', host.dark && 'v2-dark')}>
        <div className="v2-console overflow-hidden rounded-[20px] bg-[var(--v2-card)] transition-colors duration-500">
          {/* chrome */}
          <div className="flex items-center justify-between gap-3 border-b border-[var(--v2-line)] px-4 py-2.5">
            <fieldset className="flex items-center gap-1">
              <legend className="sr-only">Agent host</legend>
              {hosts.map((h, i) => (
                <button
                  key={h.id}
                  type="button"
                  aria-pressed={i === hostIndex}
                  onClick={() => {
                    setPinned(true)
                    setHostIndex(i)
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                    i === hostIndex
                      ? 'bg-[var(--v2-bg-2)] text-[var(--v2-fg)] ring-1 ring-[var(--v2-line-strong)]'
                      : 'text-[var(--v2-faint)] hover:text-[var(--v2-muted)]'
                  )}
                >
                  <h.Mark className="size-3.5 text-[var(--v2-fg)]" />
                  {h.name}
                </button>
              ))}
            </fieldset>
            <span className="hidden items-center gap-1.5 text-[11px] text-[var(--v2-faint)] sm:flex">
              <span className="inline-block size-1.5 rounded-full bg-[var(--v2-ok)]" />
              Durabull connected · read scopes
            </span>
          </div>

          {/* thread */}
          <div className="relative h-[640px] overflow-hidden px-4 pt-5 sm:h-[660px] sm:px-8">
            <div className="mx-auto max-w-2xl space-y-4">
              <AnimatePresence mode="popLayout">
                {step >= 1 ? (
                  <motion.div
                    key={`${scenario.id}-prompt`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <UserMsg>{scenario.prompt}</UserMsg>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {toolsShown > 0 ? (
                <div key={`${scenario.id}-tools`} className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--v2-accent-soft)] px-2 py-1 text-[11.5px] font-medium text-[var(--v2-accent)]">
                    <DurabullLogo className="size-3.5" />
                    Durabull
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {scenario.tools.slice(0, toolsShown).map((t, i) => {
                      const running = i === toolsShown - 1 && !showAnswer
                      return (
                        <motion.span
                          key={t}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          data-running={running}
                          className="v2-toolcall inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[var(--v2-muted)]"
                        >
                          {running ? (
                            <Loader2 className="size-3 animate-spin text-[var(--v2-accent)]" />
                          ) : (
                            <Check className="size-3 text-[var(--v2-ok)]" />
                          )}
                          {t}
                        </motion.span>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {showAnswer ? (
                <motion.p
                  key={`${scenario.id}-answer`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="text-[14.5px] leading-relaxed text-[var(--v2-fg)]"
                >
                  {scenario.answer}
                </motion.p>
              ) : null}

              {showApp ? (
                <motion.div
                  key={`${scenario.id}-${host.id}-app`}
                  initial={{ opacity: 0, y: 16, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                  className="v2-app overflow-hidden rounded-xl"
                >
                  <QueueExplorer
                    key={scenario.view}
                    initialView={scenario.view}
                    theme={host.dark ? 'dark' : 'light'}
                    showSearch={false}
                  />
                </motion.div>
              ) : null}
            </div>
            {/* inline-height fade, like a host's inline app frame */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[var(--v2-card)] to-transparent"
            />
          </div>

          {/* composer */}
          <div className="border-t border-[var(--v2-line)] px-4 py-3 sm:px-8">
            <div className="mx-auto flex max-w-2xl items-center justify-between rounded-xl border border-[var(--v2-line)] bg-[var(--v2-bg-2)] py-2 pl-4 pr-2 text-[13.5px] text-[var(--v2-faint)]">
              Ask {host.name} about your queues…
              <span className="grid size-7 place-items-center rounded-full bg-[var(--v2-fg)] text-[var(--v2-bg)]">
                <CornerDownLeft className="size-3.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-[11.5px] text-[var(--v2-faint)]">
        Illustrative conversation with fixture data. The Queue Explorer app renders inline in hosts
        that support MCP Apps; other clients get the same answers as text.
      </p>
    </div>
  )
}
