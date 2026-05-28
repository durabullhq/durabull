'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronRightIcon } from '@/components/home-2/icons'
import { home2Links } from '@/components/home-2/home-2-links'

export function Home2Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`nav-shell${scrolled ? ' scrolled' : ''}`} id="nav">
      <div className="nav-top">
        <div className="wrap">
          <span className="seg ok">
            <span>cluster</span> <span className="strong">production-redis</span>
          </span>
          <span className="seg ok">
            <span>workers</span> <span className="strong">128/142</span>
          </span>
          <span className="seg warn">
            <span>fail rate</span> <span className="strong">2.1%</span>
          </span>
          <span className="seg">
            <span>build</span> <span className="strong">1.4.7</span>
          </span>
          <span className="sp" />
          <span>Mon 26 May · 16:38 PDT</span>
        </div>
      </div>
      <div className="wrap nav">
        <Link href="/home-2" className="brand">
          <span className="brand-mark">$_</span>
          <span>Durabull</span>
        </Link>
        <nav className="nav-links" aria-label="Primary">
          <Link href={home2Links.product}>Product</Link>
          <Link href={home2Links.deploy}>Deploy</Link>
          <Link href={home2Links.pricing}>Pricing</Link>
          <Link href={home2Links.documentation}>Docs</Link>
          <Link href={home2Links.github}>GitHub</Link>
        </nav>
        <div className="nav-cta">
          <Button asChild variant="unstyled" className="btn btn-ghost">
            <Link href={home2Links.signin}>Sign in</Link>
          </Button>
          <Button asChild variant="unstyled" className="btn btn-pri">
            <Link href={home2Links.signup}>
              Start Free
              <ChevronRightIcon />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
