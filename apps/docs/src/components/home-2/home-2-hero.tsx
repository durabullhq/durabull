import Link from 'next/link'
import { home2Copy } from '@/components/home-2/home-2-copy'
import { ChevronRightIcon } from '@/components/home-2/icons'
import { home2Links } from '@/components/home-2/home-2-links'
import { Button } from '@/components/ui/button'

export function Home2Hero() {
  const { hero } = home2Copy

  return (
    <section className="hero">
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-bg" aria-hidden="true" />
      <div className="wrap hero-inner">
        <Link href={home2Links.changelog} className="hero-banner">
          <span className="tag">{hero.bannerTag}</span>
          <span>{hero.bannerText}</span>
          <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{hero.bannerCta} →</span>
        </Link>

        <h1>
          {hero.headline.line1}
          <br />
          <span className="acc">{hero.headline.accent}</span>
          <br />
          <span className="dim">{hero.headline.dim}</span>
        </h1>

        <p className="hero-sub">{hero.subhead}</p>

        <div className="hero-actions">
          <Button asChild variant="unstyled" className="btn btn-pri btn-lg">
            <Link href={home2Links.signup}>
              Start Free
              <ChevronRightIcon />
            </Link>
          </Button>
          <Button asChild variant="unstyled" className="btn btn-sec btn-lg">
            <Link href={home2Links.documentation}>View documentation</Link>
          </Button>
          <span className="live-pill">
            <span className="pulse" />
            Open source · ELv2
          </span>
        </div>

        <div className="hero-stats">
          {hero.stats.map((stat) => (
            <div key={stat.label} className="hero-stat">
              <div className="k">{stat.label}</div>
              <div className="v">
                {stat.label === 'Setup' ? (
                  <code>{stat.value}</code>
                ) : stat.label === 'Beta price' ? (
                  <>
                    {stat.value}{' '}
                    <span style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 400 }}>
                      / mo
                    </span>
                  </>
                ) : (
                  stat.value
                )}
              </div>
              <div className="d">
                {stat.label === 'Metrics' ? (
                  <>
                    <span className="pulse-dot" /> {stat.detail}
                  </>
                ) : (
                  stat.detail
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
