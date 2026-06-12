'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { faqs } from '@/lib/faqs'
import { Eyebrow, Reveal } from './reveal'

function FaqItem({
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

  return (
    <div className="border-b border-[var(--v2-line)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-6 py-5 text-left"
      >
        <span className="v2-h text-[16px] sm:text-[17px]">{question}</span>
        <Plus
          className={`size-4.5 shrink-0 text-[var(--v2-accent)] transition-transform duration-300 ${
            open ? 'rotate-45' : ''
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <p className="max-w-3xl pb-6 text-[14.5px] leading-relaxed text-[var(--v2-muted)]">
              {answer}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function V2Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="faq" className="relative scroll-mt-20 bg-[var(--v2-bg)] py-24">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <Reveal>
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="v2-h mt-4 text-3xl sm:text-4xl">Frequently asked questions</h2>
        </Reveal>

        <Reveal delay={0.08} className="mt-10">
          <div className="border-t border-[var(--v2-line)]">
            {faqs.map((faq, i) => (
              <FaqItem
                key={faq.question}
                question={faq.question}
                answer={faq.answer}
                open={openIndex === i}
                onToggle={() => setOpenIndex((curr) => (curr === i ? null : i))}
              />
            ))}
          </div>
          <p className="mt-7 text-sm text-[var(--v2-faint)]">
            Something else?{' '}
            <a
              href="mailto:hello@durabull.io"
              className="font-medium text-[var(--v2-accent)] underline-offset-4 hover:underline"
            >
              hello@durabull.io
            </a>{' '}
            — a human engineer replies within a business day.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
