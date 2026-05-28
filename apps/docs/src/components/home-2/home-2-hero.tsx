import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChevronRightIcon } from '@/components/home-2/icons'
import { home2Links } from '@/components/home-2/home-2-links'

export function Home2Hero() {
  return (
    <section className="hero">
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-bg" aria-hidden="true" />
      <div className="wrap hero-inner">
        <Link href={home2Links.changelog} className="hero-banner">
          <span className="tag">v1.4</span>
          <span>Linear integration now in beta — one issue per failed job</span>
          <span style={{ color: 'var(--ink)', fontWeight: 500 }}>Read post →</span>
        </Link>

        <h1>
          Operate every
          <br />
          BullMQ job <span className="acc">like ops.</span>
          <br />
          <span className="dim">Without digging through Redis.</span>
        </h1>

        <p className="hero-sub">
          The modern dashboard for BullMQ. Monitor queues, inspect jobs, debug failures, manage
          schedulers, and route alerts — with zero code changes to your existing workers.
        </p>

        <div className="hero-actions">
          <Button asChild variant="unstyled" className="btn btn-pri btn-lg">
            <Link href={home2Links.signup}>
              Start Free
              <ChevronRightIcon />
            </Link>
          </Button>
          <Button asChild variant="unstyled" className="btn btn-sec btn-lg">
            <Link href={home2Links.documentation}>Read documentation</Link>
          </Button>
          <span className="live-pill">
            <span className="pulse" />
            Live build · v1.4.7
          </span>
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <div className="k">$ connect</div>
            <div className="v">
              <code>rediss://...</code>
            </div>
            <div className="d">One env var. Zero patches.</div>
          </div>
          <div className="hero-stat">
            <div className="k">Price</div>
            <div className="v">
              $0{' '}
              <span style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 400 }}>/ mo</span>
            </div>
            <div className="d">Free during beta — every feature.</div>
          </div>
          <div className="hero-stat">
            <div className="k">License</div>
            <div className="v">ELv2</div>
            <div className="d">Open source · self-host anytime.</div>
          </div>
          <div className="hero-stat">
            <div className="k">Telemetry</div>
            <div className="v">Native</div>
            <div className="d">
              <span className="pulse-dot" /> No metrics DB required.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
