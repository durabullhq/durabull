import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Database,
  GitBranch,
  Layers,
  Search,
  ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { REVIEWED_LABEL } from '@/lib/compare/editorial'
import type { CompetitorCategory } from '@/lib/compare/types'
import '@/styles/editorial.css'

export function InlineText({ text }: { text: string }) {
  return text
    .split(/(`[^`]+`)/g)
    .map((part, index) =>
      part.startsWith('`') && part.endsWith('`') ? (
        <code key={`${index}-${part}`}>{part.slice(1, -1)}</code>
      ) : (
        <Fragment key={`${index}-${part}`}>{part}</Fragment>
      )
    )
}

export function EditorialHero({
  eyebrow,
  title,
  description,
  children,
  visual,
  parent = 'compare',
}: {
  eyebrow: string
  title: string
  description: string
  children?: ReactNode
  visual?: ReactNode
  parent?: 'compare' | 'blog'
}) {
  return (
    <header className="editorial-hero">
      <div className="editorial-shell">
        <nav aria-label="Breadcrumb" className="editorial-breadcrumb">
          <Link href="/">Durabull</Link>
          <span aria-hidden>/</span>
          <Link href={`/${parent}`}>{parent === 'blog' ? 'Field guides' : 'Compare'}</Link>
        </nav>
        <div className={`editorial-hero-grid ${visual ? '' : 'editorial-hero-wide'}`}>
          <div>
            <p className="editorial-eyebrow">
              <span aria-hidden />
              {eyebrow}
            </p>
            <h1>{title}</h1>
            <p className="editorial-deck">
              <InlineText text={description} />
            </p>
            {children}
          </div>
          {visual}
        </div>
      </div>
    </header>
  )
}

export function ResearchNote({ limited = false }: { limited?: boolean }) {
  return (
    <aside className={`editorial-research ${limited ? 'editorial-research-limited' : ''}`}>
      <ShieldCheck size={18} aria-hidden />
      <p>
        <strong>{limited ? 'Limited primary evidence.' : `Reviewed ${REVIEWED_LABEL}.`}</strong>{' '}
        {limited
          ? 'We could not verify current product details. Treat this page as research context, not a buying recommendation.'
          : 'Written by Durabull. We compare documented capabilities, explain where other tools fit, and link the evidence. Prices and features can change.'}{' '}
        <a href="#sources">
          See sources & methodology <ArrowDown size={12} aria-hidden />
        </a>
      </p>
    </aside>
  )
}

export function ArchitectureDiagram({ category = 'bullmq-ui' }: { category?: CompetitorCategory }) {
  const annotation = {
    'bullmq-ui': 'A dashboard observes and operates your existing queues.',
    'managed-platform':
      'A runtime changes how jobs execute. A dashboard changes how you operate them.',
    observability: 'Telemetry explains system health. Queue tools act on individual jobs.',
  }[category]
  return (
    <figure className="architecture-figure">
      <div className="figure-topline">
        <span>System map</span>
        <span aria-hidden>Redis topology</span>
      </div>
      <div className="architecture-node architecture-app">
        <GitBranch size={19} aria-hidden />
        <div>
          <strong>Your application</strong>
          <span>Producers & workers</span>
        </div>
      </div>
      <div className="architecture-connector">
        <span>enqueue / process</span>
        <ArrowDown size={20} aria-hidden />
      </div>
      <div className="architecture-node architecture-redis">
        <Database size={22} aria-hidden />
        <div>
          <strong>Redis + BullMQ</strong>
          <span>Queue state & job lifecycle</span>
        </div>
        <span className="node-tag">runtime</span>
      </div>
      <div className="architecture-connector">
        <span>inspect / operate</span>
        <ArrowDown size={20} aria-hidden />
      </div>
      <div className="architecture-node architecture-durabull">
        <Layers size={22} aria-hidden />
        <div>
          <strong>Durabull</strong>
          <span>Dashboard · alerts · MCP</span>
        </div>
        <span className="node-tag">operations</span>
      </div>
      <figcaption>{annotation}</figcaption>
    </figure>
  )
}

export function DecisionSummary({
  name,
  theirs,
  ours,
}: {
  name: string
  theirs: string
  ours: string
}) {
  return (
    <section aria-label="Which tool fits your team" className="decision-summary">
      <div>
        <span className="editorial-eyebrow">Choose {name} when</span>
        <p>
          <InlineText text={theirs} />
        </p>
      </div>
      <div>
        <span className="editorial-eyebrow">Choose Durabull when</span>
        <p>
          <InlineText text={ours} />
        </p>
      </div>
    </section>
  )
}

export function ArticleArt({ variant = 0 }: { variant?: number }) {
  return (
    <div className={`article-art article-art-${variant % 3}`} aria-hidden="true">
      <svg aria-hidden="true" viewBox="0 0 560 260" fill="none">
        <path
          className="art-grid"
          d="M0 65H560M0 130H560M0 195H560M70 0V260M140 0V260M210 0V260M280 0V260M350 0V260M420 0V260M490 0V260"
        />
        <path
          className="art-wire"
          d={
            variant % 3 === 0
              ? 'M80 130H195M365 130H480M280 85V42H440V85M280 175V218H120V175'
              : variant % 3 === 1
                ? 'M100 130H460M180 130V65H380V130M180 130V195H380V130'
                : 'M80 190H160V150H240V110H320V70H400V40H480'
          }
        />
        {[100, 280, 460].map((x, i) => (
          <g key={x}>
            <rect
              className={i === variant % 3 ? 'art-node art-node-accent' : 'art-node'}
              x={x - 34}
              y={96}
              width="68"
              height="68"
              rx="12"
            />
            <path className="art-glyph" d={`M${x - 12} 120h24M${x - 12} 130h24M${x - 12} 140h16`} />
          </g>
        ))}
        <circle
          className="art-pulse"
          cx={variant % 3 === 2 ? 320 : 190}
          cy={variant % 3 === 2 ? 70 : 130}
          r="5"
        />
      </svg>
    </div>
  )
}

const categoryChoices = [
  {
    id: 'bullmq-ui',
    icon: Search,
    title: 'Keep BullMQ. Improve operations.',
    detail: 'Compare dashboards for discovery, job inspection, team access, and recovery.',
    label: 'Explore queue dashboards',
  },
  {
    id: 'managed-platform',
    icon: GitBranch,
    title: 'Choose where your jobs run.',
    detail: 'Compare runtimes, orchestration models, infrastructure ownership, and billing units.',
    label: 'Explore runtimes & workflows',
  },
  {
    id: 'observability',
    icon: BookOpen,
    title: 'Understand the whole system.',
    detail: 'See how APM, metrics, and Redis monitoring complement queue operations.',
    label: 'Explore observability',
  },
]
export function CategoryChoices() {
  return (
    <div className="category-choices">
      {categoryChoices.map(({ id, icon: Icon, title, detail, label }, i) => (
        <a key={id} href={`#${id}`}>
          <div className="choice-top">
            <Icon size={22} aria-hidden />
            <span>0{i + 1}</span>
          </div>
          <h2>{title}</h2>
          <p>{detail}</p>
          <span className="choice-link">
            {label}
            <ArrowRight size={16} aria-hidden />
          </span>
        </a>
      ))}
    </div>
  )
}

export function GuideSteps({
  title,
  steps,
  caption,
}: {
  title: string
  steps: { title: string; detail: string }[]
  caption: string
}) {
  return (
    <figure className="guide-steps">
      <div className="figure-topline">
        <span>{title}</span>
        <GitBranch size={16} aria-hidden />
      </div>
      <ol>
        {steps.map((step, i) => (
          <li key={step.title}>
            <span className="step-number">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
            {i === steps.length - 1 ? (
              <Check size={18} aria-hidden />
            ) : (
              <ArrowDown size={18} aria-hidden />
            )}
          </li>
        ))}
      </ol>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

export function SourceReference({ label, url }: { label: string; url: string }) {
  return (
    <a href={url} className="source-reference">
      {label}
      <ArrowUpRight size={12} aria-hidden />
    </a>
  )
}
