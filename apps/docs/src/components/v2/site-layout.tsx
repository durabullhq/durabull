import type { ReactNode } from 'react'
import { V2Footer } from './closing'
import { V2Nav } from './nav'
import '@/styles/v2.css'

/** The shared public-site shell for the homepage, MCP, contact, and legal pages. */
export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="v2 relative min-h-screen overflow-x-clip font-sans">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-5 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--v2-fg)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--v2-bg)]"
      >
        Skip to content
      </a>
      <V2Nav />
      <main id="main-content">{children}</main>
      <V2Footer />
    </div>
  )
}
