import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { RootProvider } from 'fumadocs-ui/provider/next'
import 'fumadocs-ui/style.css'
import '@/styles/docs-overrides.css'
import type { ReactNode } from 'react'
import { WEB_APP_URL } from '@/lib/config'
import { source } from '../../source'

/** Share documentation navigation and browser-side index search across pages. */
export default function DocumentationLayout({ children }: { children: ReactNode }) {
  const webAppUrl = WEB_APP_URL.replace(/\/$/, '')

  return (
    <RootProvider
      search={{
        enabled: true,
        options: {
          type: 'static',
          // Static export writes a file at out/api/search, not api/search/index.html.
          api: '/api/search',
        },
      }}
    >
      <DocsLayout
        tree={source.pageTree}
        nav={{
          title: 'Durabull Documentation',
          url: '/documentation',
        }}
        themeSwitch={{
          enabled: false,
        }}
        links={[
          { text: 'Website', url: '/' },
          {
            type: 'button',
            text: 'Log In',
            url: `${webAppUrl}/login`,
            secondary: true,
            external: true,
            on: 'nav',
          },
          {
            type: 'button',
            text: 'Sign Up',
            url: `${webAppUrl}/signup`,
            external: true,
            on: 'nav',
          },
        ]}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  )
}
