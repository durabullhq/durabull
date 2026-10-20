import { Plus } from 'lucide-react'
import type { FaqItem } from '@/lib/compare/types'
import { InlineText } from './editorial'

/** Native disclosure keeps every answer in the static HTML and works without JavaScript. */
export function CompareFaqList({ faqs }: { faqs: FaqItem[] }) {
  return (
    <div className="editorial-faq border-t border-[var(--v2-line)]">
      {faqs.map((faq, index) => (
        <details
          key={faq.question}
          open={index === 0}
          className="group border-b border-[var(--v2-line)]"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left">
            <span className="v2-h text-base sm:text-[17px]">{faq.question}</span>
            <Plus
              size={18}
              aria-hidden
              className="shrink-0 text-[var(--v2-accent)] group-open:rotate-45"
            />
          </summary>
          <p className="!mt-0 max-w-3xl pb-6 !text-[14.5px] !leading-7 text-[var(--v2-muted)]">
            <InlineText text={faq.answer} />
          </p>
        </details>
      ))}
    </div>
  )
}
