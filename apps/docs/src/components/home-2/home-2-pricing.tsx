import Link from 'next/link'
import { home2Copy } from '@/components/home-2/home-2-copy'
import { Home2Headline } from '@/components/home-2/home-2-headline'
import { Button } from '@/components/ui/button'
import { CheckIcon, ChevronRightIcon } from '@/components/home-2/icons'
import { home2Links } from '@/components/home-2/home-2-links'

const PRICING_FEATURES = [
  'Unlimited connections, unlimited queues',
  'Real-time monitoring and job debugging',
  'Fleet Analytics, schedulers, worker topology',
  'Email, webhook, and Linear alerts',
  'Team and organization collaboration',
  'Cloud, Docker, desktop, or authless',
] as const

export function Home2Pricing() {
  const { pricing } = home2Copy

  return (
    <section className="pricing-section" id="pricing">
      <div className="wrap">
        <div className="pricing-grid">
          <div className="pricing-text">
            <span className="eyebrow">
              <span className="lit">{pricing.eyebrow}</span>
            </span>
            <Home2Headline
              style={{ marginTop: 18 }}
              primary={pricing.headline.primary}
              accent={pricing.headline.accent}
            />
            <p>{pricing.subhead}</p>
          </div>
          <div className="pricing-card">
            <div className="row1">
              <span className="plan">{pricing.card.plan}</span>
              <span className="badge">Current</span>
            </div>
            <div className="price">
              <span className="amt">$0</span>
              <span className="per">/ month</span>
            </div>
            <p className="note">{pricing.card.note}</p>
            <ul>
              {PRICING_FEATURES.map((feature) => (
                <li key={feature}>
                  <CheckIcon />
                  {feature}
                </li>
              ))}
            </ul>
            <Button asChild variant="unstyled" className="btn btn-pri">
              <Link href={home2Links.signup}>
                Start Free
                <ChevronRightIcon />
              </Link>
            </Button>
            <p className="commit">{pricing.card.commit}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
