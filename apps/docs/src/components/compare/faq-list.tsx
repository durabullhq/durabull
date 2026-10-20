'use client'

import { useState } from 'react'
import { FaqItem } from '@/components/v2/faq'
import type { FaqItem as FaqData } from '@/lib/compare/types'

export function CompareFaqList({ faqs }: { faqs: FaqData[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
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
  )
}
