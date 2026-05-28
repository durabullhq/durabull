import { Fragment, type CSSProperties } from 'react'

type HeadlineLines = readonly string[]

export type Home2HeadlineProps = {
  as?: 'h1' | 'h2' | 'h3'
  className?: string
  style?: CSSProperties
  primary?: HeadlineLines
  accent?: HeadlineLines
  dim?: HeadlineLines
}

function LineGroup({
  lines,
  className,
}: {
  lines: HeadlineLines
  className?: string
}) {
  return lines.map((line, index) => (
    <Fragment key={`${className ?? 'line'}-${index}`}>
      {index > 0 ? <br /> : null}
      <span className={className ? `headline-line ${className}` : 'headline-line'}>{line}</span>
    </Fragment>
  ))
}

export function Home2Headline({
  as: Tag = 'h2',
  className,
  style,
  primary,
  accent,
  dim,
}: Home2HeadlineProps) {
  const hasPrimary = Boolean(primary?.length)
  const hasAccent = Boolean(accent?.length)

  return (
    <Tag className={className} style={style}>
      {primary ? <LineGroup lines={primary} /> : null}
      {accent ? (
        <>
          {hasPrimary ? <br /> : null}
          <LineGroup lines={accent} className="acc" />
        </>
      ) : null}
      {dim ? (
        <>
          {hasPrimary || hasAccent ? <br /> : null}
          <LineGroup lines={dim} className="dim" />
        </>
      ) : null}
    </Tag>
  )
}
