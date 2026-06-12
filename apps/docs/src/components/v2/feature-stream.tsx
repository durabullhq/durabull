const TERMS = [
  'bulk retry',
  'failure-rate alerts',
  'cron schedulers',
  'fleet health score',
  'signed webhooks',
  'zero code changes',
  'stack traces',
  'queue discovery',
  'backlog pressure',
  'linear integration',
  'pause / resume',
  'live logs',
  'throughput trends',
  'worker states',
  'stalled-queue rules',
  'attempt history',
  'redis-native',
  'multi-connection',
  'grace periods',
  'delayed jobs',
]

const ROWS = 6

function rotate<T>(arr: T[], n: number): T[] {
  const k = n % arr.length
  return [...arr.slice(k), ...arr.slice(0, k)]
}

function StreamRow({ rowIndex }: { rowIndex: number }) {
  const terms = rotate(TERMS, rowIndex * 7)

  // one half of the seamless loop; rendered twice inside the marquee
  const half = (
    <span className="whitespace-nowrap">
      {terms.map((term, i) => (
        <span
          key={term}
          // a few terms catch the light; the rest sit debossed in the orange
          className={(i + rowIndex) % 7 === 0 ? 'v2-stream-hi' : undefined}
        >
          {term}
          <span className="mx-5 select-none">·</span>
        </span>
      ))}
    </span>
  )

  return (
    <div
      className="v2-marquee v2-stream-row"
      style={{
        animationDuration: `${64 + rowIndex * 13}s`,
        animationDirection: rowIndex % 2 ? 'reverse' : 'normal',
      }}
    >
      {half}
      {half}
    </div>
  )
}

/**
 * Apple-style ambient feature stream: slow marquee rows of product
 * vocabulary drifting across the orange band behind the hero video.
 * Pure CSS animation; rows freeze in place under reduced motion.
 */
export function FeatureStream() {
  return (
    <div
      aria-hidden
      className="v2-marquee-mask pointer-events-none absolute inset-0 flex flex-col justify-between overflow-hidden py-8"
    >
      {Array.from({ length: ROWS }, (_, i) => (
        <StreamRow key={i} rowIndex={i} />
      ))}
    </div>
  )
}
