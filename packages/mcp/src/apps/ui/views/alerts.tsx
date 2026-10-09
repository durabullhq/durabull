import { Alert } from '@openai/apps-sdk-ui/components/Alert'
import { Badge } from '@openai/apps-sdk-ui/components/Badge'
import { Bell } from '@openai/apps-sdk-ui/components/Icon'
import {
  Actions,
  Ask,
  Empty,
  Facts,
  Go,
  Header,
  Note,
  Payload,
  Row,
  Rows,
  Section,
  Stats,
  StatusBadge,
  useExplorer,
  useFilter,
  Warn,
} from '../components'
import { ago, type Data, fmt, num, obj, rows, str, strings, title, when } from '../format'
import { ConnectionNav } from './connection'

export function Incidents({ data }: { data: Data }) {
  const { ids, open } = useExplorer()
  const rules = obj(data.rules)
  const byQueue = rows(data.byQueue)
  const byRule = rows(data.byRule)
  return (
    <>
      <Header
        eyebrow="Durabull"
        heading="Incidents"
        subtitle={`${fmt(data.open)} open across ${fmt(byQueue.length)} queues`}
        badge={
          num(data.firing) > 0 ? (
            <StatusBadge status="firing" label={`${fmt(data.firing)} unacknowledged`} />
          ) : (
            <StatusBadge status="resolved" label="All acknowledged" />
          )
        }
      />
      <ConnectionNav current="get_alert_summary" />
      <Stats
        items={[
          ['Open', data.open, num(data.open) > 0 ? 'danger' : undefined],
          ['Unacknowledged', data.firing],
          ['Acknowledged', data.acknowledged],
          ['Rules', rules.total],
        ]}
      />
      {data.truncated ? (
        <Warn>More than 500 open events. These breakdowns cover a partial sample.</Warn>
      ) : null}
      <Section heading="By queue">
        {byQueue.length ? (
          <Rows>
            {byQueue.map((row) => (
              <Row
                key={str(row.queueName) || 'connection'}
                label={str(row.queueName) || 'Connection-wide'}
                trailing={<span className="tabular-nums">{fmt(row.open)} open</span>}
                onOpen={() =>
                  open('get_failure_events', {
                    ...ids,
                    ...(row.queueName ? { queueName: row.queueName } : {}),
                    status: 'firing',
                  })
                }
              />
            ))}
          </Rows>
        ) : (
          <Empty heading="No open incidents" />
        )}
      </Section>
      {byRule.length ? (
        <Section heading="By rule">
          <Rows>
            {byRule.map((row) => (
              <Row
                key={str(row.alertRuleId)}
                label={str(row.ruleName) || str(row.alertRuleId)}
                trailing={<span className="tabular-nums">{fmt(row.open)} open</span>}
                onOpen={() => open('get_alert_rule', { ...ids, ruleId: row.alertRuleId })}
              />
            ))}
          </Rows>
        </Section>
      ) : null}
      <Note>
        Rules: {fmt(rules.active)} active · {fmt(rules.snoozed)} snoozed · {fmt(rules.disabled)}{' '}
        disabled
      </Note>
    </>
  )
}

export function AlertEvents({ data }: { data: Data }) {
  const { ids, open } = useExplorer()
  const { filtered, input } = useFilter(rows(data.events))
  return (
    <>
      <Header
        eyebrow="Durabull"
        heading="Alerts"
        subtitle={data.total == null ? undefined : `${fmt(data.total)} alert events`}
      />
      <ConnectionNav current="get_failure_events" />
      {input}
      {filtered.length ? (
        <Rows>
          {filtered.map((event) => (
            <Row
              key={str(event.id)}
              icon={<Bell />}
              label={str(event.summary) || str(event.id)}
              meta={[str(event.queueName), `fired ${ago(event.firedAt)}`]
                .filter(Boolean)
                .join(' · ')}
              trailing={<StatusBadge status={event.status} />}
              onOpen={() => open('get_alert_event', { ...ids, eventId: event.id })}
            />
          ))}
        </Rows>
      ) : (
        <Empty heading="No alert activity">Nothing has fired for this filter.</Empty>
      )}
    </>
  )
}

const EVENT_RECEIPTS: Record<string, string> = {
  resolve_alert_event: 'Alert resolved',
  acknowledge_alert_event: 'Alert acknowledged',
  unacknowledge_alert_event: 'Acknowledgement cleared',
}
export function AlertEvent({ data, tool }: { data: Data; tool: string }) {
  const { ids } = useExplorer()
  const event = obj(data.event)
  const target = { ...ids, eventId: event.id }
  const deliveries = Array.isArray(event.deliveries) ? rows(event.deliveries) : null
  const acknowledged = Boolean(event.acknowledgedAt)
  return (
    <>
      <Header
        eyebrow={`Durabull alert · ${str(event.queueName) || 'connection'}`}
        heading={str(event.summary) || 'Alert'}
        subtitle={`${title(str(event.type))} · fired ${ago(event.firedAt)}`}
        badge={
          <StatusBadge
            status={event.status === 'firing' && acknowledged ? 'acknowledged' : event.status}
          />
        }
      />
      {EVENT_RECEIPTS[tool] ? (
        <Alert
          color="success"
          variant="soft"
          title={EVENT_RECEIPTS[tool]}
          description="Snapshot taken right after the operation."
        />
      ) : null}
      <Facts
        items={[
          ['Fired', when(event.firedAt)],
          ['Acknowledged', event.acknowledgedAt ? when(event.acknowledgedAt) : 'Not acknowledged'],
          ['Resolved', event.resolvedAt ? when(event.resolvedAt) : '—'],
          [
            'Notification sent',
            'notificationSentAt' in event ? when(event.notificationSentAt) : undefined,
          ],
        ]}
      />
      <Actions>
        <Go
          label="Inspect rule"
          tool="get_alert_rule"
          args={{ ...ids, ruleId: event.alertRuleId }}
        />
        {event.status === 'firing' ? (
          <>
            <Ask
              label={acknowledged ? 'Ask to unacknowledge' : 'Ask to acknowledge'}
              action={
                acknowledged ? 'Unacknowledge this firing alert.' : 'Acknowledge this firing alert.'
              }
              ids={target}
            />
            <Ask
              label="Ask to resolve"
              action="Resolve this firing alert. Linked external issues may close asynchronously."
              ids={target}
            />
          </>
        ) : null}
      </Actions>
      <Section
        heading="Notification delivery"
        trailing={
          deliveries ? null : <Go label="Inspect delivery" tool="get_alert_event" args={target} />
        }
      >
        {deliveries?.length ? (
          <Rows>
            {deliveries.map((delivery) => (
              <Row
                key={str(delivery.id)}
                label={title(str(delivery.channelType))}
                meta={[
                  `${fmt(delivery.attemptCount)} attempts`,
                  delivery.nextRetryAt ? `next retry ${ago(delivery.nextRetryAt)}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                detail={
                  delivery.lastError ? (
                    <p className="text-danger truncate text-sm">{str(delivery.lastError)}</p>
                  ) : null
                }
                trailing={<StatusBadge status={delivery.status} />}
              />
            ))}
          </Rows>
        ) : deliveries ? (
          <Note>No notifications were sent for this event.</Note>
        ) : (
          <Note>Delivery status is available on the event detail.</Note>
        )}
      </Section>
      {event.context != null ? (
        <Payload label="Alert context · redacted" value={event.context} />
      ) : null}
    </>
  )
}

export function Rules({ data }: { data: Data }) {
  const { ids, open } = useExplorer()
  const { filtered, input } = useFilter(rows(data.rules))
  return (
    <>
      <Header
        eyebrow="Durabull"
        heading="Alert rules"
        subtitle={data.total == null ? undefined : `${fmt(data.total)} rules`}
      />
      <ConnectionNav current="list_alert_rules" />
      {input}
      {filtered.length ? (
        <Rows>
          {filtered.map((rule) => (
            <Row
              key={str(rule.id)}
              label={str(rule.name)}
              meta={[
                title(str(rule.type)),
                str(rule.queueName) || 'Multiple queues',
                rule.mutedUntil ? `snoozed until ${when(rule.mutedUntil)}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
              trailing={
                <>
                  {num(rule.openEventCount) > 0 ? (
                    <Badge color="danger">{fmt(rule.openEventCount)} open</Badge>
                  ) : null}
                  <StatusBadge status={rule.state} />
                </>
              }
              onOpen={() => open('get_alert_rule', { ...ids, ruleId: rule.id })}
            />
          ))}
        </Rows>
      ) : (
        <Empty heading="No alert rules">
          Create rules in Durabull to get notified about failures.
        </Empty>
      )}
    </>
  )
}

const RULE_RECEIPTS: Record<string, string> = {
  snooze_alert_rule: 'Rule snoozed',
  unsnooze_alert_rule: 'Snooze cleared',
}
export function Rule({ data, tool }: { data: Data; tool: string }) {
  const { ids, open } = useExplorer()
  const rule = obj(data.rule)
  const target = { ...ids, ruleId: rule.id }
  const events = rows(data.recentEvents)
  const filtered = strings(rule.filterQueueNames)
  return (
    <>
      <Header
        eyebrow="Durabull alert rule"
        heading={str(rule.name) || 'Alert rule'}
        subtitle={`${title(str(rule.type))} · ${str(rule.queueName) || 'Multiple queues'}`}
        badge={<StatusBadge status={rule.state} />}
      />
      {RULE_RECEIPTS[tool] ? (
        <Alert
          color="success"
          variant="soft"
          title={RULE_RECEIPTS[tool]}
          description="Snapshot taken right after the operation."
        />
      ) : null}
      <Facts
        items={[
          ['Open events', fmt(rule.openEventCount)],
          ['Cooldown', `${fmt(rule.cooldownMinutes)} min`],
          ['Snoozed until', rule.mutedUntil ? when(rule.mutedUntil) : '—'],
          ['Queue filter', rule.queueFilterMode ? title(str(rule.queueFilterMode)) : undefined],
          ['Filtered queues', filtered.length ? filtered.join(', ') : undefined],
        ]}
      />
      <Actions>
        {rule.state === 'snoozed' ? (
          <Ask label="Ask to unsnooze" action="Unsnooze this alert rule." ids={target} />
        ) : rule.enabled ? (
          <Ask
            label="Ask to snooze for 1 hour"
            action="Snooze this alert rule for 60 minutes."
            ids={target}
          />
        ) : null}
      </Actions>
      <Section heading="Recent events">
        {events.length ? (
          <Rows>
            {events.map((event) => (
              <Row
                key={str(event.id)}
                label={str(event.summary) || str(event.id)}
                meta={`Fired ${ago(event.firedAt)}`}
                trailing={<StatusBadge status={event.status} />}
                onOpen={() => open('get_alert_event', { ...ids, eventId: event.id })}
              />
            ))}
          </Rows>
        ) : (
          <Note>This rule has not fired recently.</Note>
        )}
      </Section>
      <div className="flex flex-col gap-3">
        <Payload label="Rule configuration" value={rule.config} />
        <Payload label="Notification channels · redacted" value={rule.notificationChannels} />
      </div>
    </>
  )
}
