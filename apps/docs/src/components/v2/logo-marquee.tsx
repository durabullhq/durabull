'use client'

import Image from 'next/image'

const logos = [
  { name: 'Stripe', domain: 'stripe.com' },
  { name: 'Uber', domain: 'uber.com' },
  { name: 'Brex', domain: 'brex.com' },
  { name: 'Mothership', domain: 'mothership.com' },
  { name: 'DoorDash', domain: 'doordash.com' },
  { name: 'Vercel', domain: 'vercel.com' },
  { name: 'Render', domain: 'render.com' },
  { name: 'Ramp', domain: 'ramp.com' },
  { name: 'Granola', domain: 'granola.com' },
  { name: 'Airbnb', domain: 'airbnb.com' },
  { name: 'Linear', domain: 'linear.app' },
  { name: 'PostHog', domain: 'posthog.com' },
  { name: 'Netflix', domain: 'netflix.com' },
  { name: 'Figma', domain: 'figma.com' },
  { name: 'Klarna', domain: 'klarna.com' },
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
              <Image
                src={`https://www.google.com/s2/favicons?domain=${logo.domain}&sz=64`}
                alt=""
                width={18}
                height={18}
                unoptimized
                className="size-[18px] opacity-70 grayscale"
              />
              <span className="v2-h text-[16px] tracking-tight">{logo.name}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
