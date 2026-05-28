import Link from 'next/link'
import { home2Links } from '@/components/home-2/home-2-links'

export function Home2Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <Link href="/home-2" className="brand" style={{ color: 'var(--dark-fg)' }}>
              <span className="brand-mark">$_</span>
              <span>Durabull</span>
            </Link>
            <p className="footer-tag">The modern dashboard for BullMQ. Open source under ELv2.</p>
          </div>
          <div>
            <h5>Product</h5>
            <ul>
              <li>
                <Link href={home2Links.product}>Features</Link>
              </li>
              <li>
                <Link href={home2Links.pricing}>Pricing</Link>
              </li>
              <li>
                <Link href={home2Links.deploy}>Self-host</Link>
              </li>
              <li>
                <Link href={home2Links.macDownload}>Desktop apps</Link>
              </li>
            </ul>
          </div>
          <div>
            <h5>Developers</h5>
            <ul>
              <li>
                <Link href={home2Links.documentation}>Documentation</Link>
              </li>
              <li>
                <Link href="/api-reference">HTTP API</Link>
              </li>
              <li>
                <Link href={`${home2Links.documentation}/integrations/webhooks`}>Webhooks</Link>
              </li>
              <li>
                <Link href={`${home2Links.documentation}/integrations/mcp-server`}>MCP server</Link>
              </li>
            </ul>
          </div>
          <div>
            <h5>Resources</h5>
            <ul>
              <li>
                <Link href={home2Links.github}>GitHub</Link>
              </li>
              <li>
                <Link href={home2Links.changelog}>Changelog</Link>
              </li>
              <li>
                <Link href={home2Links.roadmap}>Roadmap</Link>
              </li>
              <li>
                <Link href={home2Links.contact}>Contact</Link>
              </li>
            </ul>
          </div>
          <div>
            <h5>Legal</h5>
            <ul>
              <li>
                <Link href={home2Links.github}>ELv2 License</Link>
              </li>
              <li>
                <Link href="/privacy">Privacy</Link>
              </li>
              <li>
                <Link href={home2Links.documentation}>Telemetry</Link>
              </li>
              <li>
                <Link href={`${home2Links.documentation}/operations/security-and-hardening`}>
                  Security
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 DURABULL · DURABULLHQ · ELv2</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--accent-2)',
                boxShadow: '0 0 6px var(--accent-2)',
              }}
            />
            ALL SYSTEMS OPERATIONAL
          </span>
        </div>
      </div>
    </footer>
  )
}
