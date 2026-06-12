'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Check, Cloud, Laptop, Lock, Server } from 'lucide-react'
import Link from 'next/link'
import { GITHUB_RELEASE_URL, WEB_APP_URL } from '@/lib/config'
import { Eyebrow, Reveal } from './reveal'

/* ---------------- deploy your way ---------------- */

const modes = [
  {
    icon: Cloud,
    title: 'Durabull Cloud',
    body: 'Hosted and managed. Sign up, connect Redis, done. The fastest time to value.',
    cta: { label: 'Start Free', href: `${WEB_APP_URL}/signup` },
    featured: true,
  },
  {
    icon: Server,
    title: 'Self-hosted',
    body: 'Docker on your own network. Full control, private traffic, Postgres persistence.',
    cta: { label: 'Deployment guide', href: '/documentation' },
  },
  {
    icon: Laptop,
    title: 'Desktop app',
    body: 'Native on Apple Silicon macOS and Windows. Local-first with encrypted saved connections.',
    cta: { label: 'Download', href: GITHUB_RELEASE_URL },
  },
  {
    icon: Lock,
    title: 'Authless mode',
    body: 'For trusted LANs and VPNs. Stateful Postgres or stateless PGlite persistence.',
    cta: { label: 'Read docs', href: '/documentation' },
  },
]

export function V2Deploy() {
  return (
    <section id="deploy" className="relative scroll-mt-20 bg-[var(--v2-bg)] py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <Eyebrow>Deploy your way</Eyebrow>
          <h2 className="v2-h mt-4 max-w-2xl text-balance text-3xl leading-tight sm:text-4xl">
            Cloud, desktop, Docker, or air-gapped.
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--v2-muted)]">
            Durabull is open source under the Elastic License 2.0. Run it where your security model
            says it should run.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {modes.map((mode, i) => (
            <Reveal key={mode.title} delay={0.06 * i}>
              <div
                className={`v2-card flex h-full flex-col rounded-xl p-6 ${
                  mode.featured ? 'border-[var(--v2-fg)]' : ''
                }`}
              >
                <mode.icon className="size-5 text-[var(--v2-accent)]" />
                <h3 className="v2-h mt-4 text-lg">{mode.title}</h3>
                <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-[var(--v2-muted)]">
                  {mode.body}
                </p>
                <Link
                  href={mode.cta.href}
                  className={`mt-5 inline-flex w-fit items-center rounded-lg px-4 py-2 text-[13px] font-medium ${
                    mode.featured ? 'v2-btn-primary font-semibold' : 'v2-btn-ghost'
                  }`}
                >
                  {mode.cta.label}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------- pricing ---------------- */

/** Checkmark that draws its stroke in when scrolled into view. */
function DrawnCheck({ delay }: { delay: number }) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <Check className="size-4 shrink-0 text-[var(--v2-accent)]" />
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-4 shrink-0 text-[var(--v2-accent)]"
    >
      <motion.path
        d="M4 12.5 9.5 18 20 6.5"
        initial={{ pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      />
    </svg>
  )
}

const included = [
  'Unlimited Redis connections',
  'Unlimited queues & jobs',
  'Fleet Analytics',
  'Alerts: email, webhooks, Linear',
  'Team & organizations',
  'Desktop apps included',
]

export function V2Pricing() {
  return (
    <section id="pricing" className="v2-dark relative scroll-mt-20 bg-[var(--v2-bg)] py-24">
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <Eyebrow>Honest pricing</Eyebrow>
            <h2 className="v2-h mt-4 text-balance text-3xl leading-tight text-[var(--v2-fg)] sm:text-4xl">
              Built by engineers, not a pricing team.
            </h2>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[var(--v2-muted)]">
              Durabull is open source and free while in beta. When pricing arrives, it will be
              break-even — just enough to cover cloud compute. We run queues every day too; this is
              the tool we wanted, shared with the community that needed it.
            </p>
            <p className="v2-mono mt-7 text-[var(--v2-faint)]">
              Elastic License 2.0 · Self-host anytime · No vendor lock-in
            </p>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="rounded-2xl border border-[var(--v2-line-strong)] bg-[var(--v2-card)] p-8 sm:p-9">
              <div className="flex items-baseline justify-between">
                <p className="v2-mono text-[var(--v2-accent)]">Beta · everything included</p>
                <p className="v2-h text-5xl text-[var(--v2-fg)]">
                  $0<span className="text-lg font-medium text-[var(--v2-muted)]">/mo</span>
                </p>
              </div>
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {included.map((item, i) => (
                  <li
                    key={item}
                    className="flex items-center gap-2.5 text-[13.5px] text-[var(--v2-fg)]"
                  >
                    <DrawnCheck delay={0.3 + i * 0.07} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href={`${WEB_APP_URL}/signup`}
                className="v2-btn-accent mt-8 inline-flex w-full items-center justify-center rounded-lg px-6 py-3 text-[15px] font-semibold"
              >
                Get started free
              </Link>
              <p className="mt-3.5 text-center text-xs text-[var(--v2-faint)]">
                No credit card required.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
