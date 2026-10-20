import type { ComparisonRow, CostRow } from '@/lib/compare/types'
import { InlineText } from './editorial'

export function CompareTable({
  competitorName,
  rows,
}: {
  competitorName: string
  rows: ComparisonRow[]
}) {
  return (
    <section
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Horizontal overflow must be keyboard-scrollable.
      tabIndex={0}
      aria-label="Scrollable comparison table"
      className="overflow-x-auto border border-[var(--v2-line)]"
    >
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">Durabull versus {competitorName} feature comparison</caption>
        <thead className="bg-[var(--v2-bg-2)]">
          <tr>
            <th scope="col" className="v2-mono px-4 py-3 font-medium text-[var(--v2-muted)]">
              Feature
            </th>
            <th scope="col" className="v2-mono px-4 py-3 font-medium text-[var(--v2-accent)]">
              Durabull
            </th>
            <th scope="col" className="v2-mono px-4 py-3 font-medium text-[var(--v2-muted)]">
              {competitorName}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.feature} className="border-t border-[var(--v2-line)] align-top">
              <th scope="row" className="px-4 py-3 font-medium text-[var(--v2-fg)]">
                {row.feature}
              </th>
              <td className="px-4 py-3 leading-6 text-[var(--v2-muted)]">
                <InlineText text={row.durabull} />
              </td>
              <td className="px-4 py-3 leading-6 text-[var(--v2-muted)]">
                <InlineText text={row.competitor} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function CostTable({ caption, rows }: { caption: string; rows: CostRow[] }) {
  return (
    <div>
      <section
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Horizontal overflow must be keyboard-scrollable.
        tabIndex={0}
        aria-label="Scrollable cost table"
        className="overflow-x-auto border border-[var(--v2-line)]"
      >
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-[var(--v2-bg-2)]">
            <tr>
              <th scope="col" className="v2-mono px-4 py-3 font-medium text-[var(--v2-muted)]">
                Volume
              </th>
              <th scope="col" className="v2-mono px-4 py-3 font-medium text-[var(--v2-muted)]">
                Runtime / product charges
              </th>
              <th scope="col" className="v2-mono px-4 py-3 font-medium text-[var(--v2-accent)]">
                Durabull beta fee
              </th>
              <th scope="col" className="v2-mono px-4 py-3 font-medium text-[var(--v2-muted)]">
                Unit
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.volume} className="border-t border-[var(--v2-line)] align-top">
                <th scope="row" className="px-4 py-3 font-medium text-[var(--v2-fg)]">
                  {row.volume}
                </th>
                <td className="px-4 py-3 tabular-nums leading-6 text-[var(--v2-muted)]">
                  <InlineText text={row.competitor} />
                </td>
                <td className="px-4 py-3 tabular-nums leading-6 text-[var(--v2-muted)]">
                  <InlineText text={row.durabull} />
                </td>
                <td className="px-4 py-3 leading-6 text-[var(--v2-muted)]">{row.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="mt-3 text-[13px] leading-6 text-[var(--v2-muted)]">
        <InlineText text={caption} />
      </p>
    </div>
  )
}
