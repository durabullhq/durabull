'use client'

import { ArrowRight, Github } from 'lucide-react'
import Link from 'next/link'
import { DurabullLogo, DurabullWordmark } from '@/components/durabull-logo'
import { GITHUB_RELEASE_URL, WEB_APP_URL } from '@/lib/config'
import { Reveal } from './reveal'

export function V2FinalCta() {
  return (
    <section className="v2-dark relative overflow-hidden bg-[var(--v2-bg)] py-28">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(55% 80% at 50% 100%, rgba(249,115,22,0.14) 0%, transparent 60%)',
        }}
      />
      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <Reveal>
          <p className="v2-mono text-[var(--v2-accent)]">Your queues are running right now</p>
          <h2 className="v2-h mt-5 text-balance text-4xl leading-tight text-[var(--v2-fg)] sm:text-5xl">
            Know what they&apos;re doing — before 3 a.m. does.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-[var(--v2-muted)] sm:text-base">
            Connect your Redis and see every queue, worker, and failure in under two minutes. Free
            during beta. Zero code changes.
          </p>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
            <Link
              href={`${WEB_APP_URL}/signup`}
              className="v2-btn-accent inline-flex items-center gap-2 rounded-lg px-7 py-3.5 text-[15px] font-semibold"
            >
              Start Free
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="https://github.com/durabullhq/durabull"
              className="v2-btn-ghost inline-flex items-center gap-2 rounded-lg px-7 py-3.5 text-[15px] font-medium"
            >
              <Github className="size-4" />
              Star on GitHub
            </Link>
          </div>
          <p className="v2-mono mt-7 text-[var(--v2-faint)]">
            cloud · macOS &amp; windows desktop · homebrew · docker self-host
          </p>
        </Reveal>
      </div>
    </section>
  )
}

const footerLinks = [
  { label: 'Documentation', href: '/documentation' },
  { label: 'Desktop apps', href: GITHUB_RELEASE_URL },
  { label: 'GitHub', href: 'https://github.com/durabullhq/durabull' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Contact', href: 'mailto:hello@durabull.io' },
  { label: 'Current landing', href: '/' },
]

export function V2Footer() {
  return (
    <footer className="border-t border-[var(--v2-line)] bg-[var(--v2-bg)]">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-5 py-9 sm:flex-row sm:px-8">
        <div className="flex items-center gap-2.5">
          <DurabullLogo className="h-6 w-6 text-[var(--v2-accent)]" />
          <DurabullWordmark className="h-[13px] text-[var(--v2-fg)]" />
          <span className="v2-mono ml-3 flex items-center gap-1.5 text-[var(--v2-ok)]">
            <span className="inline-block size-1.5 rounded-full bg-[var(--v2-ok)]" />
            all systems operational
          </span>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {footerLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-[12.5px] text-[var(--v2-faint)] transition-colors hover:text-[var(--v2-fg)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="v2-mono text-[var(--v2-faint)]">
          © {new Date().getFullYear()} Durabull · ELv2
        </p>
      </div>
    </footer>
  )
}
