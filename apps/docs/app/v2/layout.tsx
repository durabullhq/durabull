import type { Metadata } from 'next'
import '@/styles/v2.css'

export const metadata: Metadata = {
  title: 'Durabull — See every job. Fix every failure.',
  description:
    'The BullMQ operations platform built for on-call speed. Zero code changes: point Durabull at Redis and get fleet analytics, failure debugging, scheduler control, and proactive alerts.',
}

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return <div className="v2 relative min-h-screen overflow-x-clip font-sans">{children}</div>
}
