import type { Metadata } from 'next'
import { Home2Page } from '@/components/home-2/home-2-page'
import { SITE_URL } from '@/lib/config'

export const metadata: Metadata = {
  title: 'Durabull — Operate every BullMQ job, without digging through Redis',
  description:
    'The modern dashboard for BullMQ. Monitor queues, debug failures, manage schedulers, route alerts — with zero code changes. Free during beta. Open source under ELv2.',
  alternates: {
    canonical: `${SITE_URL}/home-2`,
  },
  openGraph: {
    title: 'Durabull — Operate every BullMQ job, without digging through Redis',
    description:
      'The modern dashboard for BullMQ. Monitor queues, debug failures, manage schedulers, route alerts — with zero code changes.',
    url: `${SITE_URL}/home-2`,
  },
}

export default function Home2RoutePage() {
  return <Home2Page />
}
