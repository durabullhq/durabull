'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
  once?: boolean
}

/** Scroll-triggered fade-up reveal. Respects reduced motion. */
export function Reveal({ children, delay = 0, y = 20, className, once = true }: RevealProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Mono uppercase section eyebrow. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="v2-mono flex items-center gap-2.5 text-[var(--v2-accent)]">
      <span aria-hidden className="inline-block size-1.5 bg-[var(--v2-accent)]" />
      {children}
    </p>
  )
}

/** Drafting cross marks for the four corners of a section container. */
export function CornerMarks() {
  return (
    <>
      <span aria-hidden className="v2-plus -left-2 -top-2" />
      <span aria-hidden className="v2-plus -right-2 -top-2" />
      <span aria-hidden className="v2-plus -bottom-2 -left-2" />
      <span aria-hidden className="v2-plus -bottom-2 -right-2" />
    </>
  )
}
