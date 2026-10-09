import {
  Empty,
  Facts,
  Header,
  Note,
  Payload,
  Row,
  Rows,
  Section,
  Stats,
  StatusBadge,
  useExplorer,
  Warn,
} from '../components'
import { ago, bytes, type Data, fmt, num, obj, percent, rows, str, title, when } from '../format'
import { healthSeries } from '../health-series'
import { ConnectionNav } from './connection'

const MEMORY_METRICS = new Set(['memoryUsagePercent', 'memory_usage_percent'])

/** Memory history as bars; unsampled buckets stay visible as gaps, never zeros. */
function MemoryChart({ series, threshold }: { series: unknown; threshold?: number }) {
  const history = healthSeries(series)
  if (!history.measured) return <Empty heading="No memory measurements in this window" />
  const max = Math.max(history.max, threshold ?? 0)
  const points = history.points
  return (
    <figure className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Memory usage: ${history.displayedMeasured} of ${points.length} displayed buckets measured. Missing measurements are gaps. Values are listed under Measurements.`}
        className="relative flex h-28 items-end gap-px"
      >
        {threshold != null ? (
          <div
            className="absolute inset-x-0 border-t border-dashed"
            style={{
              bottom: `${(threshold / max) * 100}%`,
              borderColor: 'var(--color-text-danger)',
            }}
          >
            <span className="text-danger bg-surface absolute -top-2.5 right-0 ps-1 text-[11px] leading-none">
              {percent(threshold)}
            </span>
          </div>
        ) : null}
        {points.map((point) => (
          <div
            key={point.capturedAt}
            title={`${when(point.capturedAt)}: ${point.memoryUsagePercent === null ? 'No measurement' : percent(point.memoryUsagePercent)}`}
            className="min-w-px flex-1 rounded-t-[2px]"
            style={
              point.memoryUsagePercent === null
                ? { height: 2, background: 'var(--color-border-strong, var(--color-border))' }
                : {
                    height: `${Math.max(2, (Math.max(0, point.memoryUsagePercent) / max) * 100)}%`,
                    background: 'var(--color-background-info-solid)',
                    opacity: 0.85,
                  }
            }
          />
        ))}
      </div>
      <figcaption className="text-tertiary flex justify-between text-xs">
        <span>{when(points[0]?.capturedAt)}</span>
        <span>
          {history.measured} of {history.total} buckets measured
        </span>
        <span>{when(points.at(-1)?.capturedAt)}</span>
      </figcaption>
    </figure>
  )
}

export function RedisHealth({ data }: { data: Data }) {
  const { ids, open } = useExplorer()
  const latest = obj(data.latest)
  const range = obj(data.range)
  const thresholds = rows(data.thresholds)
  const memoryThreshold = thresholds.find((rule) => MEMORY_METRICS.has(str(rule.metric)))
  const samples = healthSeries(data.series).points.slice(-20).reverse()
  return (
    <>
      <Header
        eyebrow="Durabull"
        heading="Redis health"
        subtitle={
          latest.capturedAt ? `Latest sample ${ago(latest.capturedAt)}` : 'No samples collected yet'
        }
        badge={
          data.collectionEnabled === false ? (
            <StatusBadge status="paused" label="Collection off" />
          ) : latest.isStale ? (
            <StatusBadge status="pending" label="Stale" />
          ) : null
        }
      />
      <ConnectionNav current="get_redis_health" />
      {data.collectionEnabled === false ? (
        <Warn>Redis health collection is disabled for this connection.</Warn>
      ) : null}
      {latest.isStale ? (
        <Warn>The latest Redis sample is stale. Check collection health in Durabull.</Warn>
      ) : null}
      <Stats
        items={[
          [
            'Memory',
            latest.memoryUsagePercent,
            memoryThreshold && num(latest.memoryUsagePercent) >= num(memoryThreshold.threshold)
              ? 'danger'
              : undefined,
            percent(latest.memoryUsagePercent),
          ],
          ['CPU', latest.cpuUsagePercent, undefined, percent(latest.cpuUsagePercent)],
          ['Clients', latest.connectedClients],
          [
            'Evictions / min',
            latest.evictedKeysPerMinute,
            num(latest.evictedKeysPerMinute) > 0 ? 'danger' : undefined,
          ],
        ]}
      />
      <Section
        heading="Memory usage"
        trailing={
          <span className="text-tertiary text-xs">
            {fmt(range.bucketMinutes)}-min buckets · max · {percent(range.coveragePercent)} coverage
          </span>
        }
      >
        <MemoryChart
          series={data.series}
          threshold={memoryThreshold ? num(memoryThreshold.threshold) : undefined}
        />
      </Section>
      <Section heading="Capacity">
        <Facts
          items={[
            ['Used memory', bytes(latest.usedMemoryBytes)],
            ['Resident memory', bytes(latest.residentMemoryBytes)],
            [
              'Capacity',
              `${bytes(latest.memoryCapacityBytes)}${latest.memoryCapacitySource ? ` · ${str(latest.memoryCapacitySource)}` : ''}`,
            ],
            [
              'Fragmentation',
              `${fmt(latest.memoryFragmentationRatio)}× · ${bytes(latest.memoryFragmentationBytes)}`,
            ],
            [
              'Clients',
              `${fmt(latest.connectedClients)} of ${fmt(latest.maxClients)} · ${percent(latest.connectedClientsPercent)}`,
            ],
            ['Blocked clients', fmt(latest.blockedClients)],
            ['Rejected connections / min', fmt(latest.rejectedConnectionsPerMinute)],
          ]}
        />
      </Section>
      {thresholds.length ? (
        <Section heading="Alert thresholds">
          <Rows>
            {thresholds.map((rule) => (
              <Row
                key={str(rule.ruleId)}
                label={str(rule.name)}
                meta={title(str(rule.metric))}
                trailing={<span className="tabular-nums">{fmt(rule.threshold)}</span>}
                onOpen={() => open('get_alert_rule', { ...ids, ruleId: rule.ruleId })}
              />
            ))}
          </Rows>
        </Section>
      ) : null}
      {samples.length ? (
        <Payload
          label="Measurements"
          value={samples
            .map(
              (sample) =>
                `${when(sample.capturedAt)}  ${sample.memoryUsagePercent === null ? 'no data' : percent(sample.memoryUsagePercent)}  (${sample.sampleCount} samples)`
            )
            .join('\n')}
        />
      ) : null}
      <Note>
        BullMQ workers hold blocking Redis connections, so blocked clients alone do not indicate an
        incident. Retained for {fmt(data.retentionDays)} days.
      </Note>
    </>
  )
}
