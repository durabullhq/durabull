'use client'

import { motion } from 'framer-motion'
import { ArrowRight, BookOpen, Check, KeyRound, LifeBuoy, ShieldCheck, Users } from 'lucide-react'
import Link from 'next/link'
import { usePostHog } from 'posthog-js/react'
import { useState } from 'react'
import { CONTACT_EMAIL, WEB_APP_URL } from '@/lib/config'
import { slackFaqs } from '@/lib/slack-faqs'
import { EmberField } from '../v2/ember-field'
import { FaqItem } from '../v2/faq'
import { HeroGridShimmer } from '../v2/hero-grid-shimmer'
import { Eyebrow, Reveal, useHeroFadeUp } from '../v2/reveal'

/** Durabull's direct install URL: signs in, picks the organization and starts Slack OAuth. */
export const SLACK_INSTALL_URL = `${WEB_APP_URL}/slack/install`
const SLACK_DOCS_URL = '/documentation/integrations/slack'
const SCREENSHOTS = '/images/integrations/slack'

/**
 * Records clicks on the page's Slack calls to action. Event and property names
 * match the app's Slack analytics (`slack_connect_clicked`, `slack_docs_clicked`)
 * so the marketing site shows up in the same funnel, under `slack_surface`.
 */
function useSlackLandingTracker() {
  const posthog = usePostHog()
  return (event: 'slack_connect_clicked' | 'slack_docs_clicked', placement: string) => {
    try {
      posthog?.capture(event, { slack_surface: 'marketing_site', slack_source: placement })
    } catch {
      // Analytics must never block navigation.
    }
  }
}

/** Slack's official Add to Slack button, as its brand guidelines require. */
export function AddToSlackButton({
  className,
  placement = 'other',
}: {
  className?: string
  /** Where on the page the button sits, for analytics. */
  placement?: string
}) {
  const track = useSlackLandingTracker()
  return (
    <a
      href={SLACK_INSTALL_URL}
      onClick={() => track('slack_connect_clicked', placement)}
      className={className}
      aria-label="Add Durabull to Slack"
      data-testid="add-to-slack"
    >
      {/* biome-ignore lint/performance/noImgElement: Slack's hosted button artwork */}
      <img
        alt="Add to Slack"
        height={40}
        width={139}
        src="https://platform.slack-edge.com/img/add_to_slack.png"
        srcSet="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x"
      />
    </a>
  )
}

function Screenshot({ file, alt, priority }: { file: string; alt: string; priority?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--v2-line)] bg-[var(--v2-card)] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)]">
      {/* biome-ignore lint/performance/noImgElement: static export, fixed-size screenshots */}
      <img
        src={`${SCREENSHOTS}/${file}`}
        alt={alt}
        width={1600}
        height={1000}
        loading={priority ? 'eager' : 'lazy'}
        className="block h-auto w-full"
      />
    </div>
  )
}

/* ---------------- hero ---------------- */

export function SlackHero() {
  const fadeUp = useHeroFadeUp()
  const track = useSlackLandingTracker()
  return (
    <section className="relative overflow-hidden bg-[var(--v2-bg)] pb-20 pt-36 sm:pt-44">
      <div aria-hidden className="v2-blueprint v2-blueprint-fade absolute inset-0" />
      <div aria-hidden className="v2-aurora absolute inset-0" />
      <HeroGridShimmer />
      <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-8">
        <motion.div {...fadeUp(0)}>
          <span className="v2-chip v2-mono inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[var(--v2-muted)]">
            <span className="v2-pulse-dot inline-block size-1.5 rounded-full bg-[var(--v2-accent)] text-[var(--v2-accent)]" />
            Integrations · Slack
          </span>
        </motion.div>
        <motion.h1
          {...fadeUp(0.1)}
          className="v2-h mt-8 text-balance text-[clamp(2.6rem,6vw,4.6rem)] leading-[1.02]"
        >
          BullMQ incidents,
          <br />
          <span className="text-[var(--v2-accent)]">handled in Slack.</span>
        </motion.h1>
        <motion.p
          {...fadeUp(0.2)}
          className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-[var(--v2-muted)] sm:text-lg"
        >
          Durabull posts failed jobs, stalled queues and Redis health alerts to the channels your
          team already watches. Acknowledge, resolve, snooze and retry from the message, and ask
          about any queue or job with <code className="font-mono text-[0.92em]">/durabull</code>.
        </motion.p>
        <motion.div
          {...fadeUp(0.3)}
          className="mt-9 flex flex-wrap items-center justify-center gap-4"
        >
          <AddToSlackButton
            placement="hero"
            className="inline-flex rounded-md transition-opacity hover:opacity-90"
          />
          <Link
            href={SLACK_DOCS_URL}
            onClick={() => track('slack_docs_clicked', 'hero')}
            className="v2-btn-ghost inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[15px] font-medium"
          >
            <BookOpen className="size-4" />
            Setup guide
          </Link>
        </motion.div>
        <motion.p {...fadeUp(0.38)} className="v2-mono mt-6 text-[var(--v2-faint)]">
          Team plan and up · 14-day free trial · self-hosted included
        </motion.p>
      </div>
      <div className="relative mx-auto mt-16 max-w-6xl px-5 sm:px-8">
        <Reveal y={40}>
          <Screenshot
            file="01-alerts.png"
            alt="A Durabull alert in a Slack channel showing a failing payments queue, the failed job, its error and Acknowledge, Resolve, Snooze and Open in Durabull buttons"
            priority
          />
        </Reveal>
      </div>
    </section>
  )
}

/* ---------------- feature rows ---------------- */

const features = [
  {
    eyebrow: 'One-click response',
    title: 'Respond without opening another tab.',
    body: 'Acknowledge, resolve, snooze the rule for 30 minutes to 7 days, or retry the failed job, right from the alert. Each action runs as the matching Durabull member.',
    points: [
      'Messages turn amber when acknowledged and green when resolved',
      'A thread reply records who did what, from Slack, the web app or MCP',
      'Optional @here, @channel or @oncall user-group mentions',
    ],
    file: '02-actions.png',
    alt: 'An acknowledged Durabull alert in Slack with a thread recording who acknowledged it',
  },
  {
    eyebrow: '/durabull and @Durabull',
    title: 'Ask about any queue, incident or job.',
    body: 'status, alerts, queue <name> and job <id> answer privately with /durabull, in a thread when you mention @Durabull, or in a direct message.',
    points: [
      'Live waiting, active, delayed, failed and completed counts',
      'Pause or resume a queue from the answer',
      'Plain questions work: "@Durabull what alerts are open?"',
    ],
    file: '03-commands.png',
    alt: 'Private /durabull answers in Slack listing open incidents and the job counts for the emails:send queue',
  },
  {
    eyebrow: 'App Home and link previews',
    title: 'Health at a glance, wherever you are in Slack.',
    body: 'The Durabull Home tab shows open incidents for every Redis connection with quick actions. Durabull queue, job and alert-rule links pasted in Slack unfurl with live status for members.',
    points: [
      'Per-connection firing and acknowledged counts',
      'Previews are read-only and shown only to organization members',
      'Admins can turn previews and actions off',
    ],
    file: '04-home.png',
    alt: "The Durabull App Home tab in Slack showing each connection's health and open incidents",
  },
]

export function SlackFeatures() {
  return (
    <section className="relative border-t border-[var(--v2-line)] bg-[var(--v2-bg)] py-24 sm:py-32">
      <div className="mx-auto flex max-w-7xl flex-col gap-24 px-5 sm:gap-32 sm:px-8">
        {features.map((feature, index) => (
          <div
            key={feature.file}
            className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16"
          >
            <Reveal className={index % 2 === 1 ? 'lg:order-2' : undefined}>
              <Eyebrow>{feature.eyebrow}</Eyebrow>
              <h2 className="v2-h mt-4 text-balance text-3xl leading-tight sm:text-4xl">
                {feature.title}
              </h2>
              <p className="mt-5 text-[15.5px] leading-relaxed text-[var(--v2-muted)]">
                {feature.body}
              </p>
              <ul className="mt-6 space-y-3">
                {feature.points.map((point) => (
                  <li key={point} className="flex gap-3 text-[14.5px] text-[var(--v2-fg)]">
                    <Check className="mt-0.5 size-4 shrink-0 text-[var(--v2-accent)]" />
                    {point}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.1} className={index % 2 === 1 ? 'lg:order-1' : undefined}>
              <Screenshot file={feature.file} alt={feature.alt} />
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ---------------- install steps ---------------- */

const steps = [
  {
    title: 'Add to Slack',
    body: 'Sign in to Durabull as an organization owner or admin and approve the app for your workspace.',
  },
  {
    title: 'Pick a channel',
    body: 'Create a Slack destination for any public channel, or a private one after /invite @Durabull.',
  },
  {
    title: 'Route your alert rules',
    body: 'Add the destination to an alert rule, send a test message, and try /durabull status.',
  },
]

export function SlackInstallSteps() {
  return (
    <section
      id="install"
      className="relative scroll-mt-20 border-t border-[var(--v2-line)] bg-[var(--v2-bg-2)] py-24"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="max-w-2xl">
          <Eyebrow>Set up in two minutes</Eyebrow>
          <h2 className="v2-h mt-4 text-3xl leading-tight sm:text-4xl">
            From install to first alert.
          </h2>
        </Reveal>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <Reveal key={step.title} delay={index * 0.06}>
              <li className="h-full rounded-2xl border border-[var(--v2-line)] bg-[var(--v2-card)] p-6">
                <p className="v2-mono text-[var(--v2-accent)]">0{index + 1}</p>
                <h3 className="v2-h mt-3 text-xl">{step.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--v2-muted)]">
                  {step.body}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
        <Reveal delay={0.2} className="mt-10 flex flex-wrap items-center gap-4">
          <AddToSlackButton
            placement="steps"
            className="inline-flex rounded-md transition-opacity hover:opacity-90"
          />
          <Link
            href={`${WEB_APP_URL}/signup`}
            className="inline-flex items-center gap-1.5 text-[14.5px] font-medium text-[var(--v2-fg)] underline-offset-4 hover:underline"
          >
            New to Durabull? Start free
            <ArrowRight className="size-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------------- security ---------------- */

const safeguards = [
  {
    icon: ShieldCheck,
    title: 'Verified requests',
    body: 'Every request from Slack is checked against the app’s signing secret and rejected after five minutes.',
  },
  {
    icon: Users,
    title: 'Members only',
    body: 'Actions and link previews only work for Slack users who match a member of your Durabull organization.',
  },
  {
    icon: KeyRound,
    title: 'Encrypted tokens',
    body: 'The bot token is encrypted at rest, never returned by the API, and revoked when you disconnect.',
  },
  {
    icon: LifeBuoy,
    title: 'No job payloads',
    body: 'Messages carry rule, queue and failure details. Job data never leaves Durabull.',
  },
]

export function SlackSecurity() {
  const track = useSlackLandingTracker()
  return (
    <section className="relative border-t border-[var(--v2-line)] bg-[var(--v2-bg)] py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="max-w-2xl">
          <Eyebrow>Security</Eyebrow>
          <h2 className="v2-h mt-4 text-3xl leading-tight sm:text-4xl">
            Built for production on-call.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-[var(--v2-muted)]">
            Only organization owners and admins can connect or change Slack. Read how Durabull
            handles Slack data in the{' '}
            <Link href="/privacy" className="underline underline-offset-4">
              privacy policy
            </Link>{' '}
            and the{' '}
            <Link
              href={`${SLACK_DOCS_URL}#permissions`}
              onClick={() => track('slack_docs_clicked', 'permissions')}
              className="underline underline-offset-4"
            >
              permissions it requests
            </Link>
            .
          </p>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {safeguards.map(({ icon: Icon, title, body }, index) => (
            <Reveal key={title} delay={index * 0.06}>
              <div className="h-full rounded-2xl border border-[var(--v2-line)] bg-[var(--v2-card)] p-6">
                <Icon className="size-5 text-[var(--v2-accent)]" />
                <h3 className="v2-h mt-4 text-lg">{title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--v2-muted)]">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------- FAQ and support ---------------- */

export function SlackFaq() {
  const track = useSlackLandingTracker()
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section
      id="faq"
      className="relative scroll-mt-20 border-t border-[var(--v2-line)] bg-[var(--v2-bg-2)] py-24"
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <Eyebrow>FAQ and support</Eyebrow>
          <h2 className="v2-h mt-4 text-3xl leading-tight sm:text-4xl">
            Questions about the Slack app
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-[var(--v2-muted)]">
            Need help? Email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>{' '}
            or{' '}
            <Link href="/contact" className="underline underline-offset-4">
              contact us
            </Link>
            . No account needed. The{' '}
            <Link
              href={SLACK_DOCS_URL}
              onClick={() => track('slack_docs_clicked', 'self_hosted')}
              className="underline underline-offset-4"
            >
              setup guide
            </Link>{' '}
            covers every option.
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="border-t border-[var(--v2-line)]">
            {slackFaqs.map((faq, index) => (
              <FaqItem
                key={faq.question}
                question={faq.question}
                answer={faq.answer}
                open={open === index}
                onToggle={() => setOpen((current) => (current === index ? null : index))}
              />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------------- final CTA ---------------- */

export function SlackFinalCta() {
  return (
    <section className="v2-dark relative overflow-hidden bg-[var(--v2-bg)] py-28">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(55% 80% at 50% 100%, rgba(249,115,22,0.14) 0%, transparent 60%)',
        }}
      />
      <EmberField />
      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <Reveal>
          <p className="v2-mono text-[var(--v2-accent)]">Durabull for Slack</p>
          <h2 className="v2-h mt-5 text-balance text-4xl leading-tight text-[var(--v2-fg)] sm:text-5xl">
            Your next incident can start and end in one thread.
          </h2>
          <div className="mt-9 flex justify-center">
            <AddToSlackButton
              placement="final_cta"
              className="inline-flex rounded-md transition-opacity hover:opacity-90"
            />
          </div>
          <p className="v2-mono mt-7 text-[var(--v2-faint)]">
            Team plan and up · 14-day free trial · self-hosted included
          </p>
        </Reveal>
      </div>
    </section>
  )
}
