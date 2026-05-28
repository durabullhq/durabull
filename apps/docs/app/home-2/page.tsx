import type { Metadata } from 'next'
import { home2Copy } from '@/components/home-2/home-2-copy'
import { Home2Page } from '@/components/home-2/home-2-page'
import { SITE_URL } from '@/lib/config'

export const metadata: Metadata = {
  title: home2Copy.meta.title,
  description: home2Copy.meta.description,
  alternates: {
    canonical: `${SITE_URL}/home-2`,
  },
  openGraph: {
    title: home2Copy.meta.title,
    description: home2Copy.meta.description,
    url: `${SITE_URL}/home-2`,
  },
}

export default function Home2RoutePage() {
  return <Home2Page />
}
