'use client'

import { Box, Boxes, CircuitBoard, Container, Hexagon, Layers, Triangle, Zap } from 'lucide-react'

/** Placeholder logos — swap for real customer marks when available. */
const logos = [
  { name: 'Vantage Systems', icon: Layers },
  { name: 'Quantix', icon: Hexagon },
  { name: 'Northbeam', icon: Triangle },
  { name: 'Crateworks', icon: Container },
  { name: 'Fluxbase', icon: Zap },
  { name: 'Datakraft', icon: CircuitBoard },
  { name: 'Loopline', icon: Boxes },
  { name: 'Parcelos', icon: Box },
]

export function V2LogoMarquee() {
  const row = [...logos, ...logos]

  return (
    <section
      aria-label="Companies using Durabull"
      className="border-b border-[var(--v2-line)] bg-[var(--v2-bg)] py-12"
    >
      <p className="v2-mono text-center text-[var(--v2-faint)]">
        Trusted by teams running BullMQ in production
      </p>
      <div className="v2-marquee-mask mt-8 overflow-hidden">
        <div className="v2-marquee items-center">
          {row.map((logo, i) => (
            <span
              key={`${logo.name}-${i}`}
              aria-hidden={i >= logos.length}
              className="flex shrink-0 items-center gap-2.5 px-9 text-[var(--v2-faint)] transition-colors hover:text-[var(--v2-muted)]"
            >
              <logo.icon className="size-[18px]" strokeWidth={1.75} />
              <span className="v2-h text-[16px] tracking-tight">{logo.name}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
