const TRUST_LOGOS = [
  ['A', 'acumen'],
  ['B', 'blockwise'],
  ['C', 'conduit'],
  ['P', 'parcel-io'],
  ['L', 'lattice'],
  ['S', 'sequence'],
  ['N', 'northbound'],
  ['M', 'meridian'],
  ['V', 'vector-labs'],
  ['Q', 'quench'],
  ['O', 'orbit'],
  ['F', 'fleetline'],
  ['T', 'trellis'],
  ['R', 'runway'],
] as const

function TrustLogo({ sig, name }: { sig: string; name: string }) {
  return (
    <span className="trust-logo">
      <span className="sig">{sig}</span>
      {name}
    </span>
  )
}

export function Home2Trust() {
  return (
    <section className="trust">
      <div className="wrap">
        <div className="trust-label-row">
          <span className="ping" />
          <span>Built for teams running BullMQ in production</span>
        </div>
      </div>
      <div className="trust-marquee" id="trustMarquee">
        <div className="trust-track">
          {TRUST_LOGOS.map(([sig, name], index) => (
            <span key={name}>
              {index > 0 ? <span className="trust-divider" /> : null}
              <TrustLogo sig={sig} name={name} />
            </span>
          ))}
          {TRUST_LOGOS.map(([sig, name]) => (
            <span key={`${name}-loop`}>
              <span className="trust-divider" />
              <TrustLogo sig={sig} name={name} />
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
