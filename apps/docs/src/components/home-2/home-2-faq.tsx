'use client'

import Link from 'next/link'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { ChevronDownIcon } from '@/components/home-2/icons'
import { home2Links } from '@/components/home-2/home-2-links'

const FAQ_ITEMS = [
  {
    question: 'What is Durabull?',
    answer:
      'The modern dashboard for BullMQ. Monitoring, debugging, schedulers, workers, alerts, and team collaboration — built for engineers who run background jobs in production.',
  },
  {
    question: 'Do I need to modify my BullMQ code?',
    answer: (
      <>
        No. Durabull connects directly to Redis and reads BullMQ&apos;s existing data structures. To
        unlock native telemetry charts on a queue, set <code>metrics.maxDataPoints</code> on the
        worker — that&apos;s the only optional change.
      </>
    ),
  },
  {
    question: 'Is my data secure?',
    answer: (
      <>
        Redis connections are encrypted. Job payloads stay in your Redis — Durabull reads metadata for
        display purposes only. Destructive operations require typing the exact queue name. Raw
        deletion of <code>bull:*</code> / <code>bullmq:*</code> keys is blocked. Telemetry is
        anonymous and excludes Redis URLs, queue names, job data, logs, and emails.
      </>
    ),
  },
  {
    question: 'Can I connect multiple Redis instances?',
    answer: (
      <>
        Yes. Multiple connections per org, organized into environments — production, staging, dev —
        managed in the UI or via <code>DURABULL_REDIS_URL_*</code> env vars for reproducible deploys.
      </>
    ),
  },
  {
    question: 'What does it cost?',
    answer:
      'Free during beta — every feature, unlimited connections, unlimited queues. Future pricing is intended to be break-even and cover cloud compute only. Self-host is always free under ELv2.',
  },
  {
    question: 'How do I install Durabull?',
    answer:
      'Four ways: Durabull Cloud, native desktop (macOS/Windows/Homebrew), self-hosted Docker, or from source. Cloud is the fastest; self-host gives you full control.',
  },
  {
    question: 'What is authless mode?',
    answer:
      'Sign-in-free deployment with an auto-created local org. Persistence via Postgres (teams) or PGlite (stateless / single-user). Intended for trusted LAN / VPN — not for public-internet exposure.',
  },
  {
    question: 'Which BullMQ versions are supported?',
    answer: 'BullMQ v4 and above.',
  },
] as const

export function Home2Faq() {
  return (
    <section className="faq-section" id="faq">
      <div className="wrap">
        <div className="faq-grid">
          <div>
            <span className="eyebrow">
              <span className="lit">FAQ</span>
            </span>
            <h2 style={{ marginTop: 18, fontSize: 'clamp(36px, 4.4vw, 52px)' }}>
              Common questions
              <br />
              from operators.
            </h2>
            <p style={{ marginTop: 18, fontSize: 16, maxWidth: 380, lineHeight: 1.5 }}>
              Everything else lives in the{' '}
              <Link
                href={home2Links.documentation}
                style={{
                  color: 'var(--ink)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  textDecorationColor: 'var(--border-2)',
                }}
              >
                documentation
              </Link>
              . Email{' '}
              <Link href={home2Links.contact} style={{ color: 'var(--accent)' }}>
                hello@durabull.io
              </Link>{' '}
              for anything else.
            </p>
          </div>
          <Accordion type="single" collapsible defaultValue="item-0" className="faq-list">
            {FAQ_ITEMS.map((item, index) => (
              <AccordionItem key={item.question} value={`item-${index}`} className="faq-item">
                <AccordionTrigger className="faq-q">
                  {item.question}
                  <span className="chev">
                    <ChevronDownIcon />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="faq-a">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}
