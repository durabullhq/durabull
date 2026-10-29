'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useRef } from 'react'
import { EmberField } from './ember-field'

/** Card with cursor-tracked 3D tilt, shimmer, and a sweeping border ring. */
export function TiltCard({
  featured,
  children,
}: {
  featured?: boolean
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  const onMouseMove = (e: React.MouseEvent) => {
    if (reduceMotion) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
    el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
    el.style.transform = `perspective(700px) rotateY(${((px - 0.5) * 7).toFixed(2)}deg) rotateX(${((0.5 - py) * 7).toFixed(2)}deg) translateY(-2px)`
  }

  const onMouseLeave = () => {
    const el = ref.current
    if (el) el.style.transform = ''
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse tracking is purely decorative (tilt/sheen); the card's link remains the interactive element
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`v2-card v2-tilt relative h-full overflow-hidden rounded-xl p-6 ${
        featured ? 'v2-dark v2-card-premium' : ''
      }`}
    >
      {featured ? (
        <>
          <span aria-hidden className="v2-premium-glow" />
          <span aria-hidden className="v2-premium-sheen" />
          <EmberField count={9} intensity={0.7} spread={1} />
          <span aria-hidden className="v2-premium-ring" />
        </>
      ) : null}
      <div className="relative flex h-full flex-col">{children}</div>
    </div>
  )
}

/** Checkmark that draws its stroke in when scrolled into view. */
export function DrawnCheck({ delay }: { delay: number }) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <Check className="size-4 shrink-0 text-[var(--v2-accent)]" />
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4 shrink-0 text-[var(--v2-accent)]"
    >
      <motion.path
        d="M4 12.5 9.5 18 20 6.5"
        initial={{ pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      />
    </svg>
  )
}
