'use client'

import type { ReactNode } from 'react'
import { Footer } from './footer'
import { Navigation } from './navigation'

interface LandingLayoutProps {
  children: ReactNode
  /** Whether to show the footer (default: true) */
  showFooter?: boolean
}

/**
 * Shared layout for all landing/marketing pages.
 * Includes navigation, dark mode handling, and optional footer.
 */
export function LandingLayout({ children, showFooter = true }: LandingLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <div className="noise-overlay" />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Skip to content
      </a>
      <Navigation />
      <main id="main-content">{children}</main>
      {showFooter && <Footer />}
    </div>
  )
}
