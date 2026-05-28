import { home2Copy } from '@/components/home-2/home-2-copy'
import { Home2Headline } from '@/components/home-2/home-2-headline'

export function Home2Pillars() {
  const { pillars } = home2Copy

  return (
    <section className="pillars-section" id="product">
      <div className="wrap">
        <div className="pillars-head">
          <div>
            <span className="eyebrow">
              <span className="lit">{pillars.eyebrow}</span>
            </span>
            <Home2Headline
              style={{ marginTop: 18 }}
              primary={pillars.headline.primary}
              accent={pillars.headline.accent}
            />
          </div>
          <p>{pillars.subhead}</p>
        </div>

        <div className="pillars-grid">
          {pillars.cards.map((card) => (
            <article key={card.eyebrow} className="pillar">
              <span className="eyebrow">
                <span className="lit">{card.eyebrow}</span>
              </span>
              <h3>
                {card.title} <span className="it">{card.titleAccent}</span>
              </h3>
              <p>{card.body}</p>
              {card.eyebrow === 'Fleet Analytics' && (
                <div className="demo-card">
                  <div className="lbl">
                    <span>fleet · 1h</span>
                    <span className="ok">● live</span>
                  </div>
                  score &nbsp;&nbsp;<span className="warn">▆▆▆▆▆▆▆░░░ 72</span>
                  <br />
                  done &nbsp;&nbsp;&nbsp;<span className="acc">4,182</span>{' '}
                  <span className="dim">+8.4%</span>
                  <br />
                  fail &nbsp;&nbsp;&nbsp;<span className="rose">2.1%</span>{' '}
                  <span className="dim">+0.9%</span>
                  <br />
                  <span className="dim">─────────────────────────</span>
                  <br />
                  <span className="rose">●</span> image:thumb &nbsp;<span className="rose">14.2%</span>
                  <br />
                  <span className="warn">●</span> webhook:out &nbsp;<span className="warn">3.8%</span>
                </div>
              )}
              {card.eyebrow === 'Job debugging' && (
                <div className="demo-card">
                  <div className="lbl">
                    <span>job a91f · attempt 3</span>
                    <span className="rose">FAILED</span>
                  </div>
                  <span className="rose">TypeError</span>: <span className="dim">undefined.width</span>
                  <br />
                  &nbsp;&nbsp;at resize.js:42
                  <br />
                  &nbsp;&nbsp;at worker.js:18
                  <br />
                  <span className="dim">─────────────────────────</span>
                  <br />
                  <span className="acc">→</span> retry a91f
                  <br />
                  <span className="acc">✓</span> requeued <span className="dim">attempt 4</span>
                </div>
              )}
              {card.eyebrow === 'Alerts' && (
                <div className="demo-card">
                  <div className="lbl">
                    <span>rule · image:thumb</span>
                    <span className="warn">● fired</span>
                  </div>
                  failure rate <span className="warn">&gt;12% / 15m</span>
                  <br />
                  <span className="acc">→</span> email <span className="dim">· 3 recipients</span>
                  <br />
                  <span className="acc">→</span> webhook <span className="acc">200 OK</span>{' '}
                  <span className="dim">142ms</span>
                  <br />
                  <span className="acc">→</span> linear <span className="dim">created</span>{' '}
                  <span style={{ color: '#8b8df1' }}>ENG-2814</span>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
