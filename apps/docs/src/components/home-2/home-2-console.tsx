'use client'

import { useEffect, useRef } from 'react'

const JOB_NAMES = [
  'apply-stock-delta',
  'reconcile-warehouse-bucket',
  'publish-availability-update',
  'fan-out-restock-alert',
  'sync-shopify-inventory',
] as const

const INITIAL_ROWS = [
  ['apply-stock-delta', '5:24:25 PM'],
  ['reconcile-warehouse-bucket', '5:23:28 PM'],
  ['apply-stock-delta', '5:21:12 PM'],
  ['publish-availability-update', '5:16:54 PM'],
  ['reconcile-warehouse-bucket', '5:13:40 PM'],
] as const

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function clock() {
  const d = new Date()
  let h = d.getHours()
  const m = pad(d.getMinutes())
  const s = pad(d.getSeconds())
  const am = h < 12 ? 'AM' : 'PM'
  h = h % 12 || 12
  return `${h}:${m}:${s} ${am}`
}

function JobRow({ name, time }: { name: string; time: string }) {
  return (
    <div className="mfm-tr">
      <span className="tr-cb" />
      <span className="tr-id">prod-east-inv…</span>
      <span className="tr-nm">{name}</span>
      <span className="tr-st">
        <span className="d" />
        Completed
      </span>
      <span className="tr-at">1/4</span>
      <span className="tr-tm">{time}</span>
    </div>
  )
}

export function Home2Console() {
  const tableRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tbl = tableRef.current
    if (!tbl) return

    const addRow = () => {
      if (document.hidden) return
      const name = JOB_NAMES[Math.floor(Math.random() * JOB_NAMES.length)] ?? JOB_NAMES[0]
      const row = document.createElement('div')
      row.className = 'mfm-tr fresh'
      row.innerHTML = `
      <span class="tr-cb"></span>
      <span class="tr-id">prod-east-inv…</span>
      <span class="tr-nm">${name}</span>
      <span class="tr-st"><span class="d"></span>Completed</span>
      <span class="tr-at">1/4</span>
      <span class="tr-tm">${clock()}</span>`
      const header = tbl.querySelector('.mfm-th')
      if (header) header.after(row)
      const rows = tbl.querySelectorAll('.mfm-tr')
      if (rows.length > 6) rows[rows.length - 1]?.remove()
    }

    const interval = window.setInterval(addRow, 4200)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <section className="dark console-section">
      <div className="wrap">
        <div className="console-head">
          <div>
            <span className="eyebrow on-dark">
              <span className="lit">Live from production</span> · auto-refresh
            </span>
            <h2 style={{ marginTop: 18 }}>
              Fleet visibility — <br />
              <span className="acc">in one tab.</span> <span className="dim">No metrics database.</span>
            </h2>
          </div>
          <div className="right">
            <span className="live-pill">
              <span className="pulse" />
              connected · 2s ago
            </span>
            <p>
              Cross-queue health scoring, throughput trends, backlog pressure, worker capacity —
              pulled directly from BullMQ APIs.
            </p>
          </div>
        </div>

        <div className="console-frame">
          <div className="console-bar">
            <div className="traf">
              <span className="red" />
              <span className="yel" />
              <span className="grn" />
            </div>
            <div className="title">
              <span className="h">durabull</span>
              <span style={{ opacity: 0.4 }}>@</span>
              <span>production-redis</span>
              <span style={{ opacity: 0.4 }}>~</span>
              <span style={{ opacity: 0.6 }}>queues / inventory-sync</span>
            </div>
            <div className="meta">tail -f · live</div>
          </div>

          <div className="mfb">
            <aside className="mfs">
              <div className="mfs-org">
                <span className="ic">AI</span>
                <span>Acme, Inc</span>
                <span className="ca">⇅</span>
              </div>
              <div>
                <div className="mfs-h">Connection</div>
                <div className="mfs-conn">
                  <span className="ic" />
                  <span>Worker</span>
                  <span style={{ color: 'var(--dark-fg-4)', fontSize: 11 }}>⇅</span>
                </div>
              </div>
              <div>
                <div className="mfs-h">Platform</div>
                <span className="mfs-nav on">
                  <span className="ic">▤</span>Queues
                </span>
                <span className="mfs-nav">
                  <span className="ic">▦</span>Analytics
                </span>
                <span className="mfs-nav">
                  <span className="ic">⊟</span>Workers
                </span>
                <span className="mfs-nav">
                  <span className="ic">⏱</span>Scheduled Jobs
                </span>
                <span className="mfs-nav">
                  <span className="ic">⊞</span>Redis Explorer
                </span>
              </div>
              <div>
                <div className="mfs-h">Settings</div>
                <span className="mfs-nav">
                  <span className="ic">⊕</span>Connections
                </span>
                <span className="mfs-nav">
                  <span className="ic">◐</span>Team
                </span>
              </div>
              <div className="mfs-user">
                <span className="av">JD</span>
                <div>
                  <div className="nm">John Doe</div>
                  <div className="em">john@acmeinc.com</div>
                </div>
                <span style={{ color: 'var(--dark-fg-4)', fontSize: 11 }}>⇅</span>
              </div>
            </aside>

            <main className="mfm">
              <div className="mfm-h">
                <div className="mfm-crumb">
                  <span style={{ color: 'var(--dark-fg-4)' }}>▤</span>
                  <span>queues</span>
                  <span style={{ color: 'var(--dark-fg-4)' }}>›</span>
                  <span className="q">inventory-sync</span>
                  <span className="mfm-act">Active</span>
                </div>
                <div className="mfm-btns">
                  <button type="button" className="mfm-btn">
                    ⏸ Pause
                  </button>
                  <button type="button" className="mfm-btn" style={{ padding: '6px 9px' }}>
                    ⚙
                  </button>
                </div>
              </div>
              <div className="mfm-sub">
                <span className="pd" />1 worker connected · streaming live
              </div>

              <div className="mfm-tabs">
                <span className="mfm-tab on">Jobs</span>
                <span className="mfm-tab">Observability</span>
              </div>

              <div className="mfm-kpis">
                <div className="mfm-kpi kp-wait">
                  <div className="kh">
                    <span>Waiting</span>
                    <span className="ki">
                      ⏱
                    </span>
                  </div>
                  <div className="kv">0</div>
                </div>
                <div className="mfm-kpi kp-act">
                  <div className="kh">
                    <span>Active</span>
                    <span className="ki">
                      ⚡
                    </span>
                  </div>
                  <div className="kv">0</div>
                </div>
                <div className="mfm-kpi kp-dly">
                  <div className="kh">
                    <span>Delayed</span>
                    <span className="ki">
                      ⏲
                    </span>
                  </div>
                  <div className="kv">0</div>
                </div>
                <div className="mfm-kpi kp-pr">
                  <div className="kh">
                    <span>Prioritized</span>
                    <span className="ki">
                      ↑
                    </span>
                  </div>
                  <div className="kv">0</div>
                </div>
                <div className="mfm-kpi kp-fail">
                  <div className="kh">
                    <span>Failed</span>
                    <span className="ki">
                      ⚠
                    </span>
                  </div>
                  <div className="kv">10</div>
                </div>
                <div className="mfm-kpi kp-ch">
                  <div className="kh">
                    <span>Waiting Children</span>
                    <span className="ki">
                      ⤵
                    </span>
                  </div>
                  <div className="kv">0</div>
                </div>
              </div>

              <div className="mfm-filter">
                <div className="mff">
                  All statuses<span style={{ color: 'var(--dark-fg-4)' }}>⌄</span>
                </div>
                <div className="mff ip">🔍 Search by job ID</div>
                <label className="mff-cb">
                  <span className="b" /> Hide scheduled jobs
                </label>
                <div className="mff-tabs">
                  <span className="mff-tab on">Jobs</span>
                  <span className="mff-tab">Scheduled (0)</span>
                </div>
              </div>

              <div className="mfm-tbl" id="mockTbl" ref={tableRef}>
                <div className="mfm-th">
                  <span />
                  <span>ID</span>
                  <span>NAME</span>
                  <span>STATUS</span>
                  <span>ATTEMPTS</span>
                  <span>CREATED (PST)</span>
                </div>
                {INITIAL_ROWS.map(([name, time]) => (
                  <JobRow key={`${name}-${time}`} name={name} time={time} />
                ))}
              </div>
            </main>
          </div>
        </div>
      </div>
    </section>
  )
}
