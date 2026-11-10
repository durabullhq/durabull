'use client'

import { PostHogProvider as PHProvider } from 'posthog-js/react'
import type { ReactNode } from 'react'

const normalizeUrl = (value: string | undefined) => value?.trim()?.replace(/\/$/, '')

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()
const webAppUrl = normalizeUrl(process.env.NEXT_PUBLIC_WEB_APP_URL)
const posthogHost = webAppUrl ? `${webAppUrl}/ingest` : undefined
const isProd = process.env.NODE_ENV === 'production'

let didWarnMissingConfig = false

function warnMissingPosthogConfig() {
  if (isProd || didWarnMissingConfig) return
  didWarnMissingConfig = true
  console.warn('[PostHog] Missing NEXT_PUBLIC_POSTHOG_KEY or NEXT_PUBLIC_WEB_APP_URL for docs')
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  // Don't wrap with provider if PostHog isn't configured
  if (!posthogKey || !posthogHost) {
    warnMissingPosthogConfig()
    return <>{children}</>
  }

  return (
    <PHProvider
      apiKey={posthogKey}
      options={{
        api_host: posthogHost,
        ui_host: 'https://us.posthog.com',
        defaults: '2025-05-24',
        persistence: 'localStorage+cookie',
        cross_subdomain_cookie: true,
        debug: !isProd,
        // The docs and marketing site shares the product's PostHog project. Tag every event so
        // product insights can exclude site visitors from active-user counts.
        before_send: (event) => {
          if (event) {
            event.properties = { ...event.properties, surface: 'docs' }
          }
          return event
        },
      }}
    >
      {children}
    </PHProvider>
  )
}
