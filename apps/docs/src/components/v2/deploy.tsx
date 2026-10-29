'use client'

import { Cloud, Laptop, Lock, type LucideIcon, Server } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { GITHUB_RELEASE_URL, MAC_CHECKSUM_URL, WEB_APP_URL } from '@/lib/config'
import { Eyebrow, Reveal } from './reveal'
import { DrawnCheck, TiltCard } from './tilt-card'

/* ---------------- deploy your way ---------------- */

type DeployMode = {
  icon: LucideIcon
  title: string
  body: string
  cta: { label: string; href: string }
  featured?: boolean
  verification?: { label: string; href: string }
}

const modes: DeployMode[] = [
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
    body: 'Docker on your own network, with persistent PGlite or PostgreSQL storage.',
    cta: { label: 'Deployment guide', href: '/documentation/deployment/docker' },
  },
  {
    icon: Laptop,
    title: 'Desktop app',
    body: 'Native on Apple Silicon macOS and Windows. Local-first with encrypted saved connections.',
    cta: { label: 'Download', href: GITHUB_RELEASE_URL },
    verification: { label: 'Verify macOS DMG SHA-256', href: MAC_CHECKSUM_URL },
  },
  {
    icon: Lock,
    title: 'Authless mode',
    body: 'For trusted private networks. PostgreSQL and PGlite both persist data.',
    cta: { label: 'Read docs', href: '/documentation' },
  },
]

export function V2Deploy({
  intro = 'Durabull is open source under the Apache License 2.0. Run it where your security model says it should run.',
}: {
  intro?: ReactNode
}) {
  return (
    <section id="deploy" className="relative scroll-mt-20 bg-[var(--v2-bg)] py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <Eyebrow>Deploy your way</Eyebrow>
          <h2 className="v2-h mt-4 max-w-2xl text-balance text-3xl leading-tight sm:text-4xl">
            Cloud, desktop, or self-hosted.
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--v2-muted)]">
            {intro}
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {modes.map((mode, i) => (
            <Reveal key={mode.title} delay={0.06 * i} className="h-full">
              <TiltCard featured={mode.featured}>
                <div className="flex items-center justify-between">
                  <mode.icon
                    className={`size-5 text-[var(--v2-accent)] ${
                      mode.featured ? 'drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]' : ''
                    }`}
                  />
                  {mode.featured ? (
                    <span className="v2-premium-badge v2-mono text-[10px]">recommended</span>
                  ) : null}
                </div>
                <h3
                  className={`v2-h mt-4 text-lg ${
                    mode.featured ? 'v2-premium-title' : 'text-[var(--v2-fg)]'
                  }`}
                >
                  {mode.title}
                </h3>
                <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-[var(--v2-muted)]">
                  {mode.body}
                </p>
                <Link
                  href={mode.cta.href}
                  className={`mt-5 inline-flex w-fit items-center rounded-lg px-4 py-2 text-[13px] font-medium ${
                    mode.featured ? 'v2-btn-accent font-semibold' : 'v2-btn-ghost'
                  }`}
                >
                  {mode.cta.label}
                </Link>
                {mode.verification ? (
                  <Link
                    href={mode.verification.href}
                    className="v2-mono mt-3 text-[11px] text-[var(--v2-faint)] underline decoration-[var(--v2-line-strong)] underline-offset-4 transition-colors hover:text-[var(--v2-fg)]"
                  >
                    {mode.verification.label}
                  </Link>
                ) : null}
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------- pricing ---------------- */

const tiers = [
  { name: 'Free', price: '$0', detail: '1 connection · 1 person · email alerts' },
  {
    name: 'Team',
    price: '$9',
    detail: '5 connections · 10 members · webhooks, Linear, MCP writes',
  },
  {
    name: 'Business',
    price: '$29',
    detail: '15 connections · 50 members · 30-day Redis health history',
  },
]

export function V2Pricing() {
  return (
    <section id="pricing" className="v2-dark relative scroll-mt-20 bg-[var(--v2-bg)] py-24">
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <Eyebrow>Honest pricing</Eyebrow>
            <h2 className="v2-h mt-4 text-balance text-3xl leading-tight text-[var(--v2-fg)] sm:text-4xl">
              One price per team. No per-job fees.
            </h2>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[var(--v2-muted)]">
              Durabull Cloud is billed per organization, not per person or per job. Start free, and
              move up when you collaborate or connect more Redis databases. Self-hosting under the
              Apache License 2.0 stays free.
            </p>
            <p className="v2-mono mt-7 text-[var(--v2-faint)]">
              Apache License 2.0 · Self-host anytime · No vendor lock-in
            </p>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="rounded-2xl border border-[var(--v2-line-strong)] bg-[var(--v2-card)] p-8 sm:p-9">
              <ul className="grid gap-5">
                {tiers.map((tier, i) => (
                  <li key={tier.name} className="flex items-start gap-3">
                    <DrawnCheck delay={0.3 + i * 0.07} />
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="v2-mono text-[var(--v2-accent)]">{tier.name}</span>
                        <span className="v2-h text-2xl text-[var(--v2-fg)]">
                          {tier.price}
                          <span className="text-sm font-medium text-[var(--v2-muted)]">/mo</span>
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] text-[var(--v2-muted)]">{tier.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href="/pricing"
                className="mt-6 inline-flex text-sm text-[var(--v2-accent)] hover:underline"
              >
                Compare all plans, including Enterprise
              </Link>
              <Link
                href={`${WEB_APP_URL}/signup`}
                className="v2-btn-accent mt-8 inline-flex w-full items-center justify-center rounded-lg px-6 py-3 text-[15px] font-semibold"
              >
                Get started free
              </Link>
              <p className="mt-3.5 text-center text-xs text-[var(--v2-faint)]">
                No credit card required for Free or the 14-day Business trial.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
