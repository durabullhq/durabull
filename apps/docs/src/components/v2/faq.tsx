'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useId, useState } from 'react'
import { CONTACT_EMAIL } from '@/lib/config'
import { faqs } from '@/lib/faqs'
import { Eyebrow, Reveal } from './reveal'

export function FaqItem({
  question,
  answer,
  open,
  onToggle,
}: {
  question: string
  answer: string
  open: boolean
  onToggle: () => void
}) {
  const reduceMotion = useReducedMotion()
  const panelId = useId()

  return (
    <div className="border-b border-[var(--v2-line)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-6 py-5 text-left"
      >
        <span className="v2-h text-[16px] sm:text-[17px]">{question}</span>
        <Plus
          className={`size-4.5 shrink-0 text-[var(--v2-accent)] transition-transform duration-300 ${
            open ? 'rotate-45' : ''
          }`}
        />
      </button>
      {/* Collapsed answers stay in the HTML so crawlers see what the FAQ structured data lists. */}
      <motion.div
        id={panelId}
        inert={!open}
        initial={false}
        animate={open ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        className="overflow-hidden"
      >
        <p className="max-w-3xl pb-6 text-[14.5px] leading-relaxed text-[var(--v2-muted)]">
          {answer}
        </p>
      </motion.div>
    </div>
  )
}

/** Accordion of question/answer pairs; the first item starts open. */
export function FaqList({ items }: { items: ReadonlyArray<{ question: string; answer: string }> }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <div className="border-t border-[var(--v2-line)]">
      {items.map((faq, i) => (
        <FaqItem
          key={faq.question}
          question={faq.question}
          answer={faq.answer}
          open={openIndex === i}
          onToggle={() => setOpenIndex((curr) => (curr === i ? null : i))}
        />
      ))}
    </div>
  )
}

/** Closing line under an FAQ list that points to the team inbox. */
export function FaqContact({ lead = 'Something else?' }: { lead?: string }) {
  return (
    <p className="mt-7 text-sm text-[var(--v2-faint)]">
      {lead}{' '}
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="font-medium text-[var(--v2-accent)] underline-offset-4 hover:underline"
      >
        {CONTACT_EMAIL}
      </a>{' '}
      — a human engineer replies within a business day.
    </p>
  )
}

/** Section with an eyebrow, heading, FAQ accordion, and the inbox line. */
export function FaqSection({
  id,
  eyebrow,
  title,
  items,
  contactLead,
}: {
  id: string
  eyebrow: string
  title: string
  items: ReadonlyArray<{ question: string; answer: string }>
  contactLead?: string
}) {
  return (
    <section id={id} className="relative scroll-mt-20 bg-[var(--v2-bg)] py-24">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="v2-h mt-4 text-3xl sm:text-4xl">{title}</h2>
        </Reveal>

        <Reveal delay={0.08} className="mt-10">
          <FaqList items={items} />
          <FaqContact lead={contactLead} />
        </Reveal>
      </div>
    </section>
  )
}

export function V2Faq() {
  return <FaqSection id="faq" eyebrow="FAQ" title="Frequently asked questions" items={faqs} />
}
