'use client'

import { ArrowUpRight, Github } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { DurabullLogo, DurabullWordmark } from '@/components/durabull-logo'
import { WEB_APP_URL } from '@/lib/config'

const links = [
  { label: 'Features', href: '#features' },
  { label: 'Product', href: '#product' },
  { label: 'Deploy', href: '#deploy' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Docs', href: '/documentation' },
]

export function V2Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? 'border-[var(--v2-line)] bg-[rgba(255,255,255,0.85)] backdrop-blur-xl'
          : 'border-transparent bg-transparent'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/v2" className="flex items-center gap-2.5">
          <DurabullLogo className="h-7 w-7 text-[var(--v2-accent)]" />
          <DurabullWordmark className="h-[15px] text-[var(--v2-fg)]" />
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-[13.5px] font-medium text-[var(--v2-muted)] transition-colors hover:text-[var(--v2-fg)]"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="https://github.com/durabullhq/durabull"
            aria-label="GitHub"
            className="hidden text-[var(--v2-muted)] transition-colors hover:text-[var(--v2-fg)] sm:block"
          >
            <Github className="size-[18px]" />
          </Link>
          <Link
            href={`${WEB_APP_URL}/login`}
            className="hidden text-[13.5px] font-medium text-[var(--v2-muted)] transition-colors hover:text-[var(--v2-fg)] sm:block"
          >
            Sign in
          </Link>
          <Link
            href={`${WEB_APP_URL}/signup`}
            className="v2-btn-primary inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13.5px] font-semibold"
          >
            Start Free
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </nav>
    </header>
  )
}
