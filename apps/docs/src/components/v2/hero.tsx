'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BookOpen } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { WEB_APP_URL } from '@/lib/config'

export function V2Hero() {
  const reduceMotion = useReducedMotion()
  const fadeUp = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: [0.2, 0.8, 0.2, 1] as const },
        }

  return (
    <section className="relative overflow-hidden bg-[var(--v2-bg)] pt-36 sm:pt-44">
      <div aria-hidden className="v2-blueprint v2-blueprint-fade absolute inset-0" />

      <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-8">
        <motion.div {...fadeUp(0)}>
          <span className="v2-chip v2-mono inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[var(--v2-muted)]">
            <span className="inline-block size-1.5 rounded-full bg-[var(--v2-accent)]" />
            Open source · Free during beta
          </span>
        </motion.div>

        <motion.h1
          {...fadeUp(0.1)}
          className="v2-h mt-8 text-balance text-[clamp(2.6rem,5.6vw,4.4rem)] leading-[1.04]"
        >
          The operations platform
          <br />
          for <span className="text-[var(--v2-accent)]">BullMQ</span>
        </motion.h1>

        <motion.p
          {...fadeUp(0.2)}
          className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-[var(--v2-muted)] sm:text-lg"
        >
          Monitor queues, debug failures, manage schedulers, and watch your whole fleet — with zero
          changes to your worker code. Point Durabull at Redis and go.
        </motion.p>

        <motion.div
          {...fadeUp(0.3)}
          className="mt-9 flex flex-wrap items-center justify-center gap-3.5"
        >
          <Link
            href={`${WEB_APP_URL}/signup`}
            className="v2-btn-primary inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[15px] font-semibold"
          >
            Start Free
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/documentation"
            className="v2-btn-ghost inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[15px] font-medium"
          >
            <BookOpen className="size-4" />
            Read the docs
          </Link>
        </motion.div>

        <motion.p {...fadeUp(0.4)} className="v2-mono mt-7 text-[var(--v2-faint)]">
          No credit card · BullMQ v4+ · Cloud, desktop, or self-hosted
        </motion.p>
      </div>

      {/* vibrant band with top-cropped product screenshot */}
      <div className="v2-dark v2-shot-bg relative mt-16 sm:mt-20">
        <div className="relative mx-auto max-w-6xl px-5 pt-14 sm:px-8 sm:pt-20">
          <motion.div
            {...(reduceMotion
              ? {}
              : {
                  initial: { opacity: 0, y: 56 },
                  animate: { opacity: 1, y: 0 },
                  transition: { duration: 0.9, delay: 0.35, ease: [0.2, 0.8, 0.2, 1] as const },
                })}
          >
            {/* crop: show roughly the top third of the product */}
            <div className="v2-frame max-h-[230px] rounded-t-xl border-b-0 sm:max-h-[320px] lg:max-h-[380px]">
              <div className="flex items-center gap-1.5 border-b border-[var(--v2-line)] px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                <span className="size-2.5 rounded-full bg-[#febc2e]" />
                <span className="size-2.5 rounded-full bg-[#28c840]" />
                <span className="v2-mono ml-3 normal-case tracking-normal text-[var(--v2-faint)]">
                  app.durabull.io — fleet analytics
                </span>
              </div>
              <Image
                src="/screenshots/fleet-analytics-dash.png"
                alt="Durabull Fleet Analytics dashboard with fleet-wide queue health, throughput, and operational telemetry."
                width={1600}
                height={1000}
                priority
                className="w-full"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
