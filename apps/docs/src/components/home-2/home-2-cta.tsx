import Link from 'next/link'
import { home2Copy } from '@/components/home-2/home-2-copy'
import { Home2Headline } from '@/components/home-2/home-2-headline'
import { Button } from '@/components/ui/button'
import { ChevronRightIcon, DesktopIcon, GithubIcon } from '@/components/home-2/icons'
import { home2Links } from '@/components/home-2/home-2-links'

const QUICK_LINKS = [
  home2Links.macDownload,
  home2Links.documentation,
  home2Links.documentation,
  home2Links.github,
] as const

export function Home2Cta() {
  const { cta } = home2Copy

  return (
    <section className="dark cta-section">
      <div className="wrap cta-inner">
        <span className="eyebrow on-dark">
          <span className="lit">{cta.eyebrow}</span> · cloud · docker · desktop · self-host
        </span>
        <Home2Headline
          style={{ marginTop: 18 }}
          primary={cta.headline.primary}
          dim={cta.headline.dim}
        />
        <p>{cta.subhead}</p>
        <div className="actions">
          <Button asChild variant="unstyled" className="btn btn-pri btn-lg">
            <Link href={home2Links.signup}>
              Start Free
              <ChevronRightIcon />
            </Link>
          </Button>
          <Button asChild variant="unstyled" className="btn btn-sec btn-lg">
            <Link href={home2Links.documentation}>Read documentation</Link>
          </Button>
        </div>
        <div className="quick">
          {cta.quick.map((label, index) => (
            <Link key={label.label} href={QUICK_LINKS[index]}>
              {index === 0 ? <DesktopIcon /> : null}
              {index === 3 ? <GithubIcon /> : null}
              {label.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
