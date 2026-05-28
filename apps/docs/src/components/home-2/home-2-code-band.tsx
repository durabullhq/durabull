'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import { home2Copy } from '@/components/home-2/home-2-copy'
import { Button } from '@/components/ui/button'
import { CheckIcon } from '@/components/home-2/icons'

const TABS = [
  { id: 'docker', label: 'docker', icon: '⊟' },
  { id: 'env', label: 'env', icon: '$' },
  { id: 'brew', label: 'homebrew', icon: '∴' },
  { id: 'worker', label: 'worker.ts', icon: '{}' },
] as const

type TabId = (typeof TABS)[number]['id']

function CodeBlock({ id, active, children }: { id: TabId; active: TabId; children: ReactNode }) {
  return (
    <div className={`code-block${active === id ? ' on' : ''}`} id={`block-${id}`}>
      {children}
    </div>
  )
}

export function Home2CodeBand() {
  const { integration } = home2Copy
  const [activeTab, setActiveTab] = useState<TabId>('docker')
  const [copied, setCopied] = useState(false)

  const copySnippet = async () => {
    const active = document.querySelector('.code-block.on')
    if (!active) return
    await navigator.clipboard.writeText(active.textContent ?? '')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <section className="dark code-band">
      <div className="wrap">
        <div className="code-band-grid">
          <div className="code-band-text">
            <span className="eyebrow on-dark">
              <span className="lit">{integration.eyebrow}</span>
            </span>
            <h2 style={{ marginTop: 18 }}>
              {integration.headline.line1}
              <br />
              <span className="acc">{integration.headline.accent}</span>
              <br />
              <span className="dim">{integration.headline.dim}</span>
            </h2>
            <p>{integration.subhead}</p>
            <ul className="feats">
              {integration.bullets.map((bullet) => (
                <li key={bullet}>
                  <CheckIcon />
                  {bullet}
                </li>
              ))}
            </ul>
          </div>

          <div className="code-tabs">
            <div className="code-tabs-bar">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`code-tab${activeTab === tab.id ? ' on' : ''}`}
                  data-tab={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="ico">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="code-tabs-body">
              <CodeBlock id="docker" active={activeTab}>
                <span className="ln">
                  <span className="com"># point at Redis · see your queues</span>
                </span>
                <span className="ln">
                  <span className="pr">$</span> docker run -p <span className="str">3000:3000</span>{' '}
                  \
                </span>
                <span className="ln">
                  <span className="indent" />
                  -e <span className="var">DURABULL_REDIS_URL</span>=
                  <span className="str">&quot;rediss://prod-cache:6379&quot;</span> \
                </span>
                <span className="ln">
                  <span className="indent" />
                  -e <span className="var">DURABULL_REDIS_URL_STAGING</span>=
                  <span className="str">&quot;redis://staging:6379&quot;</span> \
                </span>
                <span className="ln">
                  <span className="indent" />
                  <span className="acc">durabullhq/durabull</span>:latest
                </span>
                <span className="ln" style={{ marginTop: 14 }}>
                  <span className="com">› queue discovery: 14 queues found</span>
                </span>
                <span className="ln">
                  <span className="com">› workers connected: 128/142 active</span>
                </span>
                <span className="ln">
                  <span className="arr">→</span> dashboard live at{' '}
                  <span className="acc">http://localhost:3000</span>
                </span>
              </CodeBlock>

              <CodeBlock id="env" active={activeTab}>
                <span className="ln">
                  <span className="com"># reproducible-deploys via env</span>
                </span>
                <span className="ln">
                  <span className="var">DURABULL_REDIS_URL_PROD</span>=
                  <span className="str">&quot;rediss://prod-cache:6379&quot;</span>
                </span>
                <span className="ln">
                  <span className="var">DURABULL_REDIS_URL_STAGING</span>=
                  <span className="str">&quot;redis://staging:6379&quot;</span>
                </span>
                <span className="ln">
                  <span className="var">DURABULL_REDIS_URL_EDGE_EU</span>=
                  <span className="str">&quot;rediss://eu-cache:6379&quot;</span>
                </span>
                <span className="ln" style={{ marginTop: 8 }}>
                  <span className="var">DURABULL_AUTHLESS</span>=<span className="str">&quot;true&quot;</span>{' '}
                  <span className="com"># trusted VPN only</span>
                </span>
                <span className="ln">
                  <span className="var">DURABULL_POSTGRES_URL</span>=
                  <span className="str">&quot;postgres://...&quot;</span>
                </span>
                <span className="ln" style={{ marginTop: 14 }}>
                  <span className="com">› connections are read-only in the UI</span>
                </span>
                <span className="ln">
                  <span className="com">› safe to ship via your existing CD pipeline</span>
                </span>
              </CodeBlock>

              <CodeBlock id="brew" active={activeTab}>
                <span className="ln">
                  <span className="com"># macOS Apple Silicon</span>
                </span>
                <span className="ln">
                  <span className="pr">$</span> brew install --cask{' '}
                  <span className="acc">durabullhq/tap/durabull</span>
                </span>
                <span className="ln" style={{ marginTop: 8 }}>
                  <span className="com">› downloads ~38 MB · Apple Silicon native</span>
                </span>
                <span className="ln">
                  <span className="com">› bundles Bun API + web UI</span>
                </span>
                <span className="ln">
                  <span className="com">› authless by default · PGlite persistence</span>
                </span>
                <span className="ln" style={{ marginTop: 14 }}>
                  <span className="pr">$</span> open -a Durabull
                </span>
                <span className="ln">
                  <span className="arr">→</span> dashboard live · works offline against local Redis
                </span>
              </CodeBlock>

              <CodeBlock id="worker" active={activeTab}>
                <span className="ln">
                  <span className="com">{'// the only worker-side change you\'ll ever make'}</span>
                </span>
                <span className="ln">
                  <span className="kw">import</span> {'{'} <span className="fn">Worker</span> {'}'}{' '}
                  <span className="kw">from</span> <span className="str">&quot;bullmq&quot;</span>
                  {';'}
                </span>
                <span className="ln" />
                <span className="ln">
                  <span className="kw">new</span> <span className="fn">Worker</span>(
                  <span className="str">&quot;email:send&quot;</span>, send, {'{'}
                </span>
                <span className="ln">
                  <span className="indent" />
                  <span className="var">connection</span>: redis,
                </span>
                <span className="ln">
                  <span className="indent" />
                  <span className="acc">metrics</span>: {'{'} <span className="var">maxDataPoints</span>:{' '}
                  <span className="str">10080</span> {'}'} <span className="com">{'// 1 week @ 1/min'}</span>
                </span>
                <span className="ln">{'})'};</span>
                <span className="ln" style={{ marginTop: 14 }}>
                  <span className="com">› enables BullMQ-native telemetry charts</span>
                </span>
                <span className="ln">
                  <span className="com">› no other change required. ever.</span>
                </span>
              </CodeBlock>
            </div>
            <div className="code-tabs-foot">
              <span>↑↓ to navigate · ↵ to run</span>
              <Button type="button" variant="unstyled" id="copyCode" onClick={() => void copySnippet()}>
                {copied ? 'copied ✓' : 'copy snippet'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
