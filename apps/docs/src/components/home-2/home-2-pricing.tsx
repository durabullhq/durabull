import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CheckIcon, ChevronRightIcon } from '@/components/home-2/icons'
import { home2Links } from '@/components/home-2/home-2-links'

export function Home2Pricing() {
  return (
    <section className="pricing-section" id="pricing">
      <div className="wrap">
        <div className="pricing-grid">
          <div className="pricing-text">
            <span className="eyebrow">
              <span className="lit">Pricing</span>
            </span>
            <h2 style={{ marginTop: 18 }}>
              Free during beta.
              <br />
              <span className="acc">Break-even after.</span>
            </h2>
            <p>
              No per-seat trickery. No &quot;contact sales&quot;. Future pricing covers cloud compute
              — nothing more. Self-host is always free under ELv2.
            </p>
          </div>
          <div className="pricing-card">
            <div className="row1">
              <span className="plan">Beta · everything included</span>
              <span className="badge">Current</span>
            </div>
            <div className="price">
              <span className="amt">$0</span>
              <span className="per">/ month</span>
            </div>
            <p className="note">No card. No upsell. Cancel by closing the tab.</p>
            <ul>
              <li>
                <CheckIcon />
                Unlimited connections, unlimited queues
              </li>
              <li>
                <CheckIcon />
                Real-time monitoring &amp; job debugging
              </li>
              <li>
                <CheckIcon />
                Fleet Analytics, schedulers, worker topology
              </li>
              <li>
                <CheckIcon />
                Email, webhook, and Linear alerts
              </li>
              <li>
                <CheckIcon />
                Team &amp; organization collaboration
              </li>
              <li>
                <CheckIcon />
                Cloud, Docker, desktop, or authless
              </li>
            </ul>
            <Button asChild variant="unstyled" className="btn btn-pri">
              <Link href={home2Links.signup}>
                Start Free
                <ChevronRightIcon />
              </Link>
            </Button>
            <p className="commit">{'// future pricing covers cloud compute only'}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
