import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { Metadata } from 'next'
import { MarketingGoogleAnalytics } from '@/components/google-analytics'
import { PostHogProvider } from '@/components/posthog-provider'
import '@/styles/globals.css'
import '@/styles/landing.css'

export const metadata: Metadata = {
  title: {
    default: 'Durabull — Agentic operations for BullMQ',
    template: '%s | Durabull',
  },
  description:
    'Monitor, debug, and operate BullMQ queues from one dashboard, or from Claude, ChatGPT, Cursor, and any MCP client through Durabull MCP.',
  metadataBase: new URL('https://durabull.io'),
  keywords: [
    'BullMQ',
    'Redis',
    'queue',
    'job queue',
    'background jobs',
    'admin dashboard',
    'monitoring',
    'Node.js',
  ],
  authors: [{ name: 'Durabull' }],
  creator: 'Durabull',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://durabull.io',
    title: 'Durabull — Agentic operations for BullMQ',
    description:
      'Monitor, debug, and operate BullMQ queues from one dashboard, or from Claude, ChatGPT, Cursor, and any MCP client through Durabull MCP.',
    siteName: 'Durabull',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Durabull — Agentic operations for BullMQ',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Durabull — Agentic operations for BullMQ',
    description:
      'Monitor, debug, and operate BullMQ queues from one dashboard, or from Claude, ChatGPT, Cursor, and any MCP client through Durabull MCP.',
    images: ['/og-image.png'],
    creator: '@durabullhq',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', type: 'image/png', sizes: '96x96' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/site.webmanifest',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen bg-background font-sans antialiased`}
      >
        <MarketingGoogleAnalytics />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
