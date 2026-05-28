import { home2Copy } from '@/components/home-2/home-2-copy'

const FLOW_OUTPUTS = [
  <>
    <span className="rose">●</span> a91f failed <span className="dim">attempt 3</span>
  </>,
  <>
    <span className="rose">TypeError</span>: undefined.width
    {'\n  '}
    <span className="dim">at resize.js:42</span>
  </>,
  <>
    <span className="info">INFO</span> <span className="ok">[resize]</span> start{'\n'}
    <span className="warn">WARN</span> <span className="ok">[resize]</span> retry=2{'\n'}
    <span className="rose">ERROR</span> failed
  </>,
  <>
    <span className="ok">→</span> retry a91f{'\n'}
    <span className="ok">✓</span> requeued <span className="dim">attempt 4</span>
  </>,
  <>
    <span className="info">linear</span> <span className="dim">created</span>
    {'\n'}
    ENG-2814 <span className="ok">▸</span> img:thumb
  </>,
] as const

export function Home2Flow() {
  const { flow } = home2Copy

  return (
    <section className="flow-section">
      <div className="wrap">
        <div className="flow-head">
          <span className="eyebrow">
            <span className="lit">{flow.eyebrow}</span>
          </span>
          <h2>
            <span className="acc">{flow.headline.accent}</span> {flow.headline.rest}
          </h2>
          <p>{flow.subhead}</p>
        </div>
        <div className="flow-steps">
          {flow.steps.map((step, index) => (
            <div key={step.index} className="flow-step">
              <span className="ix">{step.index}</span>
              <h4>{step.title}</h4>
              <p>{step.body}</p>
              <div className="out">{FLOW_OUTPUTS[index]}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
