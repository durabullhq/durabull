export function Home2Pillars() {
  return (
    <section className="pillars-section" id="product">
      <div className="wrap">
        <div className="pillars-head">
          <div>
            <span className="eyebrow">
              <span className="lit">Built for operators</span>
            </span>
            <h2 style={{ marginTop: 18 }}>
              Three pillars,
              <br />
              working <span className="acc">together by default.</span>
            </h2>
          </div>
          <p>
            Fleet visibility, incident workflow, and proactive alerts — designed to compress the time
            between &quot;page&quot; and &quot;fixed&quot; inside one browser tab.
          </p>
        </div>

        <div className="pillars-grid">
          <article className="pillar">
            <span className="eyebrow">
              <span className="lit">Fleet Analytics</span>
            </span>
            <h3>
              Cross-queue intelligence, <span className="it">not infinite tabs.</span>
            </h3>
            <p>
              One health score per Redis connection. Throughput, backlog pressure, failure rates,
              worker capacity, scheduler load — sortable, filterable, risk-ranked.
            </p>
            <div className="demo-card">
              <div className="lbl">
                <span>fleet · 1h</span>
                <span className="ok">● live</span>
              </div>
              score &nbsp;&nbsp;<span className="warn">▆▆▆▆▆▆▆░░░ 72</span>
              <br />
              done &nbsp;&nbsp;&nbsp;<span className="acc">4,182</span> <span className="dim">+8.4%</span>
              <br />
              fail &nbsp;&nbsp;&nbsp;<span className="rose">2.1%</span> <span className="dim">+0.9%</span>
              <br />
              <span className="dim">─────────────────────────</span>
              <br />
              <span className="rose">●</span> image:thumb &nbsp;<span className="rose">14.2%</span>
              <br />
              <span className="warn">●</span> webhook:out &nbsp;<span className="warn">3.8%</span>
            </div>
          </article>

          <article className="pillar">
            <span className="eyebrow">
              <span className="lit">Incident workflow</span>
            </span>
            <h3>
              From paged to fixed, <span className="it">in the same tab.</span>
            </h3>
            <p>
              Failed job → payload → stack trace → structured logs → retry. Bulk ops up to 100.
              Destructive actions confirmed by typing the exact queue name.
            </p>
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
          </article>

          <article className="pillar">
            <span className="eyebrow">
              <span className="lit">Proactive alerts</span>
            </span>
            <h3>
              Fires whether <span className="it">you have the tab open or not.</span>
            </h3>
            <p>
              Background monitor polls Redis on its own. Email, signed webhooks (HMAC +
              idempotency), or Linear with one issue per failed job — durably deduped.
            </p>
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
          </article>
        </div>
      </div>
    </section>
  )
}
