'use client'

import { motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  Calendar,
  Database,
  GitBranch,
  LineChart,
  ShieldCheck,
} from 'lucide-react'

const capabilities = [
  {
    icon: Activity,
    eyebrow: 'Real-Time Ops',
    title: 'Unified Queue Command Center',
    description:
      'Track waiting, active, delayed, completed, and failed jobs from one automatically refreshed dashboard.',
    spanClass: 'md:col-span-7',
  },
  {
    icon: AlertTriangle,
    eyebrow: 'Debugging',
    title: 'Failure Analysis with Full Context',
    description:
      'Inspect stack traces, attempt history, payload metadata, and retry controls in one place when incidents happen.',
    spanClass: 'md:col-span-5',
  },
  {
    icon: Calendar,
    eyebrow: 'Scheduling',
    title: 'Cron Visibility That Scales',
    description: 'Review next runs and create, edit, or remove cron and interval schedulers.',
    spanClass: 'md:col-span-3',
  },
  {
    icon: GitBranch,
    eyebrow: 'Topology',
    title: 'Worker and Connection Awareness',
    description:
      'Understand where jobs run across environments and workers so on-call decisions happen with confidence.',
    spanClass: 'md:col-span-3',
  },
  {
    icon: Database,
    eyebrow: 'Data Layer',
    title: 'Redis Insight Without Guesswork',
    description:
      'Inspect key structures and queue internals directly from the UI while keeping production troubleshooting focused.',
    spanClass: 'md:col-span-3',
  },
  {
    icon: LineChart,
    eyebrow: 'Fleet Analytics',
    title: 'Throughput Trends Across Queues',
    description:
      'Visualize throughput and backlog across queues. Throughput charts require BullMQ worker metrics.',
    spanClass: 'md:col-span-3',
  },
  {
    icon: ShieldCheck,
    eyebrow: 'Trust',
    title: 'Developer-First Security Posture',
    description:
      'Designed for teams that need observability and control without sacrificing governance, access boundaries, or auditability.',
    spanClass: 'md:col-span-12',
  },
]

export function Features() {
  return (
    <section id="features" className="relative overflow-hidden py-32 scroll-mt-24">
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0)_0%,rgba(16,185,129,0.08)_48%,rgba(2,6,23,0)_100%)]"
        aria-hidden="true"
      />
      <div className="container relative z-10 mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl text-center"
        >
          <span className="inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-emerald-200/80">
            Production Capabilities
          </span>
          <h2 className="mt-6 text-balance text-4xl font-semibold tracking-tight md:text-6xl">
            Every control surface needed to run BullMQ with confidence.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">
            Durabull is intentionally built for engineering teams that need speed during incidents
            and clarity during everyday queue operations.
          </p>
        </motion.div>

        <div className="mt-16 grid gap-5 md:grid-cols-12">
          {capabilities.map((capability, index) => (
            <motion.article
              key={capability.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.45, delay: index * 0.05 }}
              className={`feature-panel ${capability.spanClass}`}
            >
              <div className="mb-6 inline-flex rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-emerald-200">
                <capability.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200/70">
                {capability.eyebrow}
              </p>
              <h3 className="mt-3 text-xl font-semibold text-foreground md:text-2xl">
                {capability.title}
              </h3>
              <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
                {capability.description}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}
