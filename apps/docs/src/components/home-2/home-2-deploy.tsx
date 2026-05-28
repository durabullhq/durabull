import Link from 'next/link'
import { home2Copy } from '@/components/home-2/home-2-copy'
import { CheckIconSm } from '@/components/home-2/icons'
import { home2Links } from '@/components/home-2/home-2-links'

const DEPLOY_LINKS = [
  home2Links.signup,
  home2Links.documentation,
  home2Links.macDownload,
  home2Links.documentation,
] as const

const DEPLOY_CMDS = [
  '$ open https://durabull.io',
  '$ docker run durabullhq/durabull',
  '$ brew install --cask durabull',
  'DURABULL_AUTHLESS=true',
] as const

export function Home2Deploy() {
  const { deploy } = home2Copy

  return (
    <section className="deploy-section" id="deploy">
      <div className="wrap">
        <div className="deploy-head">
          <span className="eyebrow">
            <span className="lit">{deploy.eyebrow}</span>
          </span>
          <h2 style={{ marginTop: 18 }}>
            {deploy.headline.rest} <span className="acc">{deploy.headline.accent}</span>
          </h2>
          <p style={{ marginTop: 18, fontSize: 17, maxWidth: 600, lineHeight: 1.5 }}>{deploy.subhead}</p>
        </div>
        <div className="deploy-grid">
          {deploy.cards.map((card, index) => (
            <div key={card.title} className={`deploy-cell${index === 0 ? ' fea' : ''}`}>
              <span className="kx">{card.kx}</span>
              <h4>{card.title}</h4>
              <p>{card.body}</p>
              <div className="cmd-mini">{DEPLOY_CMDS[index]}</div>
              <ul>
                {card.bullets.map((bullet) => (
                  <li key={bullet}>
                    <CheckIconSm />
                    {bullet}
                  </li>
                ))}
              </ul>
              <Link className="link" href={DEPLOY_LINKS[index]}>
                {card.link} →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
