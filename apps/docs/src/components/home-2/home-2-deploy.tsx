import Link from 'next/link'
import { CheckIconSm } from '@/components/home-2/icons'
import { home2Links } from '@/components/home-2/home-2-links'

export function Home2Deploy() {
  return (
    <section className="deploy-section" id="deploy">
      <div className="wrap">
        <div className="deploy-head">
          <span className="eyebrow">
            <span className="lit">Deployment</span>
          </span>
          <h2 style={{ marginTop: 18 }}>
            Cloud, Docker, desktop, <span className="acc">or authless.</span>
          </h2>
          <p style={{ marginTop: 18, fontSize: 17, maxWidth: 600, lineHeight: 1.5 }}>
            Same product, same UI, same APIs. Choose the deployment that matches your security
            boundary — and switch later if it changes.
          </p>
        </div>
        <div className="deploy-grid">
          <div className="deploy-cell fea">
            <span className="kx">Fastest time-to-value</span>
            <h4>Cloud</h4>
            <p>Sign up, paste your Redis URL, see your queues.</p>
            <div className="cmd-mini">$ open https://durabull.io</div>
            <ul>
              <li>
                <CheckIconSm />
                OAuth · Google, GitHub
              </li>
              <li>
                <CheckIconSm />
                Multi-env, multi-connection
              </li>
              <li>
                <CheckIconSm />
                Free during beta
              </li>
            </ul>
            <Link className="link" href={home2Links.signup}>
              Start Free →
            </Link>
          </div>
          <div className="deploy-cell">
            <span className="kx">Private network</span>
            <h4>Docker self-host</h4>
            <p>Same container in your VPC. Postgres-backed teams, full feature parity.</p>
            <div className="cmd-mini">$ docker run durabullhq/durabull</div>
            <ul>
              <li>
                <CheckIconSm />
                Single container
              </li>
              <li>
                <CheckIconSm />
                Env-driven connections
              </li>
              <li>
                <CheckIconSm />
                Open source · ELv2
              </li>
            </ul>
            <Link className="link" href={home2Links.documentation}>
              Self-host guide →
            </Link>
          </div>
          <div className="deploy-cell">
            <span className="kx">Local-first</span>
            <h4>Native desktop</h4>
            <p>macOS, Windows installer, Homebrew cask. Works offline.</p>
            <div className="cmd-mini">$ brew install --cask durabull</div>
            <ul>
              <li>
                <CheckIconSm />
                Authless · PGlite
              </li>
              <li>
                <CheckIconSm />
                Bundled Bun API + UI
              </li>
              <li>
                <CheckIconSm />
                Encrypted saved URLs
              </li>
            </ul>
            <Link className="link" href={home2Links.macDownload}>
              Download →
            </Link>
          </div>
          <div className="deploy-cell">
            <span className="kx">Trusted LAN / VPN</span>
            <h4>Authless mode</h4>
            <p>No sign-in, auto local org. Postgres or PGlite persistence.</p>
            <div className="cmd-mini">DURABULL_AUTHLESS=true</div>
            <ul>
              <li>
                <CheckIconSm />
                Solo or trusted team
              </li>
              <li>
                <CheckIconSm />
                Postgres or PGlite
              </li>
              <li>
                <CheckIconSm />
                Not for public internet
              </li>
            </ul>
            <Link className="link" href={home2Links.documentation}>
              Read the guide →
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
