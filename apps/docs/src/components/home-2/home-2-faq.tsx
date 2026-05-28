'use client'

import Link from 'next/link'
import { home2Copy, home2FaqItems } from '@/components/home-2/home-2-copy'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { ChevronDownIcon } from '@/components/home-2/icons'
import { home2Links } from '@/components/home-2/home-2-links'

export function Home2Faq() {
  const { faq } = home2Copy

  return (
    <section className="faq-section" id="faq">
      <div className="wrap">
        <div className="faq-grid">
          <div>
            <span className="eyebrow">
              <span className="lit">{faq.eyebrow}</span>
            </span>
            <h2 style={{ marginTop: 18, fontSize: 'clamp(36px, 4.4vw, 52px)' }}>{faq.headline}</h2>
            <p style={{ marginTop: 18, fontSize: 16, maxWidth: 380, lineHeight: 1.5 }}>
              {faq.asideBeforeDocs}
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
              {faq.asideAfterDocs}
              <Link href={home2Links.contact} style={{ color: 'var(--accent)' }}>
                hello@durabull.io
              </Link>
              {faq.asideAfterEmail}
            </p>
          </div>
          <Accordion type="single" collapsible defaultValue="item-0" className="faq-list">
            {home2FaqItems.map((item, index) => (
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
