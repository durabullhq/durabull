'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  Eye,
  Layers,
  Lock,
  Maximize2,
  MessageSquareText,
  Moon,
  PanelRight,
  ShieldCheck,
  Sun,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { EmberField } from '../v2/ember-field'
import { Reveal } from '../v2/reveal'
import { ClaudeMark, OpenAIMark } from './brand-marks'
import { MCP_HOST_SURFACES, McpAppFrame, type McpHostSurface } from './mcp-app-frame'

const traits = [
  {
    icon: Layers,
    title: 'About 20 views, one app',
    body: 'Connections, queues, jobs, workers, schedules, incidents, alert rules, Redis health, and failure investigations. You can drill from fleet to stack trace without typing.',
  },
  {
    icon: MessageSquareText,
    title: 'Changes go through your agent',
    body: 'The app can only call read tools. Buttons like “Ask to retry” send the request back to the conversation, so your agent and your host’s approval step stay in charge.',
  },
  {
    icon: Eye,
    title: 'Your agent sees what you see',
    body: 'As you browse, the app tells the model which queue or job you have open, so “why is this one stuck?” just works.',
  },
  {
    icon: Maximize2,
    title: 'Inline or fullscreen',
    body: 'Starts inline in the thread and expands to fullscreen when you need room. It follows your host’s theme and safe areas.',
  },
  {
    icon: PanelRight,
    title: 'ChatGPT Work entrypoints',
    body: 'In ChatGPT Work, on supported surfaces, Queue Explorer can also open from the global sidebar and the conversation panel.',
  },
  {
    icon: Lock,
    title: 'Holds no secrets',
    body: 'The app has no network access, no stored tokens, and no local storage. All data comes through authorized tool calls, redacted on the server.',
  },
]

export function McpApps() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [host, setHost] = useState<McpHostSurface>('claude')
  const [asked, setAsked] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const onAsk = (text: string) => {
    setAsked(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setAsked(null), 3200)
  }

  return (
    <section
      id="apps"
      className="v2-dark relative scroll-mt-20 overflow-hidden bg-[var(--v2-bg)] py-24 sm:py-32"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(50% 40% at 50% 0%, rgba(249,115,22,0.16), transparent 70%), radial-gradient(40% 50% at 100% 60%, rgba(234,88,12,0.08), transparent 70%)',
        }}
      />
      <div aria-hidden className="v2-blueprint v2-blueprint-fade absolute inset-0" />
      <EmberField count={26} intensity={0.8} spread={1} />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-4xl text-center">
          <span className="v2-chip v2-mono inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[var(--v2-accent)]">
            <Layers className="size-3.5" />
            MCP Apps · app extensions
          </span>
          <h2 className="v2-h mt-6 text-balance text-4xl leading-[1.05] text-[var(--v2-fg)] sm:text-6xl">
            Not a wall of JSON.
            <br />
            <span className="text-[var(--v2-accent)]">A live dashboard in the chat.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-[16px] leading-relaxed text-[var(--v2-muted)]">
            When your host supports MCP Apps, Durabull answers with Queue Explorer: an interactive
            Durabull view inside the conversation. Click through it yourself, then ask your agent to
            act on what you find.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-[var(--v2-muted)]">
            <span className="inline-flex items-center gap-2">
              <ClaudeMark className="size-4" /> Claude &amp; Cowork
            </span>
            <span className="inline-flex items-center gap-2">
              <OpenAIMark className="size-4 text-[var(--v2-fg)]" /> ChatGPT
            </span>
            <span className="text-[var(--v2-faint)]">
              · other clients get the same answers as text
            </span>
          </div>
        </Reveal>

        {/* interactive explorer */}
        <Reveal delay={0.1} className="relative mx-auto mt-14 max-w-4xl">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="v2-mono text-[var(--v2-faint)]">Try it · the real app, live</p>
            <div className="flex flex-wrap items-center gap-2">
              <fieldset className="inline-flex rounded-lg border border-[var(--v2-line-strong)] p-0.5">
                <legend className="sr-only">Host</legend>
                {(Object.keys(MCP_HOST_SURFACES) as McpHostSurface[]).map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={host === h}
                    onClick={() => setHost(h)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                      host === h
                        ? 'bg-[var(--v2-fg)] text-[var(--v2-bg)]'
                        : 'text-[var(--v2-faint)] hover:text-[var(--v2-fg)]'
                    )}
                  >
                    {h === 'claude' ? (
                      <ClaudeMark className="size-3.5" />
                    ) : (
                      <OpenAIMark className="size-3.5" />
                    )}
                    {MCP_HOST_SURFACES[h].name}
                  </button>
                ))}
              </fieldset>
              <fieldset className="inline-flex rounded-lg border border-[var(--v2-line-strong)] p-0.5">
                <legend className="sr-only">Host theme</legend>
                {(['light', 'dark'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={theme === t}
                    aria-label={t === 'light' ? 'Light theme' : 'Dark theme'}
                    onClick={() => setTheme(t)}
                    className={cn(
                      'inline-flex items-center rounded-md px-2 py-1 transition-colors',
                      theme === t
                        ? 'bg-[var(--v2-fg)] text-[var(--v2-bg)]'
                        : 'text-[var(--v2-faint)] hover:text-[var(--v2-fg)]'
                    )}
                  >
                    {t === 'light' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                  </button>
                ))}
              </fieldset>
            </div>
          </div>

          <div className="v2-frame relative rounded-2xl">
            <McpAppFrame
              tool="get_connection_overview"
              host={host}
              theme={theme}
              onAsk={onAsk}
              className="p-2 sm:p-4"
            />
          </div>

          <AnimatePresence>
            {asked ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute inset-x-4 bottom-4 z-10 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-[var(--v2-line-strong)] bg-[var(--v2-card)] px-4 py-3 text-[13px] shadow-2xl"
                role="status"
              >
                <MessageSquareText className="size-4 shrink-0 text-[var(--v2-accent)]" />
                <span className="text-[var(--v2-muted)]">
                  Sent to your agent: <span className="text-[var(--v2-fg)]">“{asked}”</span>
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Reveal>

        {/* traits */}
        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-[var(--v2-line)] bg-[var(--v2-line)] sm:grid-cols-2 lg:grid-cols-3">
          {traits.map((t, i) => (
            <Reveal key={t.title} delay={i * 0.05} className="h-full">
              <div className="v2-cell h-full p-7">
                <span aria-hidden className="v2-cell-ticks" />
                <t.icon className="size-5 text-[var(--v2-accent)]" />
                <h3 className="v2-h mt-4 text-[17px] text-[var(--v2-fg)]">{t.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--v2-muted)]">{t.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-8 flex items-center justify-center gap-2 text-[12.5px] text-[var(--v2-faint)]">
          <ShieldCheck className="size-4 text-[var(--v2-ok)]" />
          Built on the open MCP Apps standard, with ChatGPT Apps metadata. Shown here with fixture
          data.
        </Reveal>
      </div>
    </section>
  )
}
