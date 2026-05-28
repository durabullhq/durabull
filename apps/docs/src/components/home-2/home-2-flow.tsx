const FLOW_STEPS = [
  {
    index: '01 / FAILED',
    title: 'Job lands in failed.',
    body: 'Filter by status, search by id, or follow the alert deep-link.',
    output: (
      <>
        <span className="rose">●</span> a91f failed <span className="dim">attempt 3</span>
      </>
    ),
  },
  {
    index: '02 / TRACE',
    title: 'Read the stack.',
    body: 'Paginated from the job hash. No HGET required.',
    output: (
      <>
        <span className="rose">TypeError</span>: undefined.width
        {'\n  '}
        <span className="dim">at resize.js:42</span>
      </>
    ),
  },
  {
    index: '03 / LOGS',
    title: 'Structured logs.',
    body: 'Level badges, context tags, key/value coloring, search.',
    output: (
      <>
        <span className="info">INFO</span> <span className="ok">[resize]</span> start{'\n'}
        <span className="warn">WARN</span> <span className="ok">[resize]</span> retry=2{'\n'}
        <span className="rose">ERROR</span> failed
      </>
    ),
  },
  {
    index: '04 / RETRY',
    title: 'Retry or invoke.',
    body: 'One job or bulk up to 100. Original payload preserved.',
    output: (
      <>
        <span className="ok">→</span> retry a91f{'\n'}
        <span className="ok">✓</span> requeued <span className="dim">attempt 4</span>
      </>
    ),
  },
  {
    index: '05 / TICKET',
    title: 'Linear, deduped.',
    body: 'One issue per failed job. Durable mapping prevents retry-storm duplicates.',
    output: (
      <>
        <span className="info">linear</span> <span className="dim">created</span>
        {'\n'}
        ENG-2814 <span className="ok">▸</span> img:thumb
      </>
    ),
  },
] as const

export function Home2Flow() {
  return (
    <section className="flow-section">
      <div className="wrap">
        <div className="flow-head">
          <span className="eyebrow">
            <span className="lit">Incident pipeline</span>
          </span>
          <h2>
            Five steps, <span className="acc">one keyboard.</span>
          </h2>
          <p>
            The flow you already run during an incident — wired together. No tab-switching to{' '}
            <code>redis-cli</code>, no copy-pasting job IDs into Slack threads.
          </p>
        </div>
        <div className="flow-steps">
          {FLOW_STEPS.map((step) => (
            <div key={step.index} className="flow-step">
              <span className="ix">{step.index}</span>
              <h4>{step.title}</h4>
              <p>{step.body}</p>
              <div className="out">{step.output}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
