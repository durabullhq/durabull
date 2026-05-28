import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChevronRightIcon, DesktopIcon, GithubIcon } from '@/components/home-2/icons'
import { home2Links } from '@/components/home-2/home-2-links'

export function Home2Cta() {
  return (
    <section className="dark cta-section">
      <div className="wrap cta-inner">
        <span className="eyebrow on-dark">
          <span className="lit">Final step</span> · cloud · docker · desktop · authless
        </span>
        <h2 style={{ marginTop: 18 }}>
          Roll out Durabull
          <br />
          <span className="acc">your way.</span> <span className="dim">Worker code untouched.</span>
        </h2>
        <p>
          Free during beta. Cloud signup in 30 seconds, or pull the Docker image into your VPC. Zero
          worker code changes either way.
        </p>
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
          <Link href={home2Links.macDownload}>
            <DesktopIcon />
            $ open Durabull.app
          </Link>
          <Link href={home2Links.documentation}>$ docker run durabullhq/durabull</Link>
          <Link href={home2Links.documentation}>$ brew install --cask durabull</Link>
          <Link href={home2Links.github}>
            <GithubIcon />
            $ git clone durabullhq/durabull
          </Link>
        </div>
      </div>
    </section>
  )
}
