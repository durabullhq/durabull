import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Search, Storage } from '@openai/apps-sdk-ui/components/Icon'
import { Input } from '@openai/apps-sdk-ui/components/Input'
import { useState } from 'react'
import { ChipRow, useExplorer } from './components'
import type { ToolName } from './views/registry'

/** Connection-scoped destinations, in display order. */
const NAV: [string, ToolName][] = [
  ['Overview', 'get_connection_overview'],
  ['Queues', 'list_queues'],
  ['Workers', 'get_workers'],
  ['Schedules', 'list_scheduled_jobs'],
  ['Incidents', 'get_alert_summary'],
  ['Alerts', 'get_failure_events'],
  ['Rules', 'list_alert_rules'],
  ['Redis', 'get_redis_health'],
]
/** Views where exact job search is the point of the card, so it starts open. */
const SEARCH_FIRST = new Set(['get_connection_overview', 'find_job'])

/**
 * Navigation shown under every connection-scoped card: destination chips, exact job-ID
 * search and a way back to the connection list.
 */
export function ConnectionNav({ current, jobId = '' }: { current: string; jobId?: string }) {
  const { ids, open, disabled } = useExplorer()
  const [searching, setSearching] = useState(SEARCH_FIRST.has(current))
  return (
    <>
      <ChipRow label="Connection views">
        {NAV.map(([label, tool]) => (
          <Button
            key={tool}
            color="secondary"
            variant={tool === current ? 'soft' : 'ghost'}
            size="xs"
            selected={tool === current}
            aria-current={tool === current ? 'page' : undefined}
            disabled={disabled}
            onClick={() => open(tool, { connectionId: ids.connectionId })}
          >
            {label}
          </Button>
        ))}
        <Button
          color="secondary"
          variant={searching ? 'soft' : 'ghost'}
          size="xs"
          aria-expanded={searching}
          onClick={() => setSearching(!searching)}
        >
          <Search />
          Find job
        </Button>
        <Button
          color="secondary"
          variant="ghost"
          size="xs"
          disabled={disabled}
          onClick={() => open('list_connections', {})}
        >
          <Storage />
          Connections
        </Button>
      </ChipRow>
      {searching ? <JobSearch initial={jobId} /> : null}
    </>
  )
}

/** Exact job-ID search across this connection, independent of page filtering. */
function JobSearch({ initial }: { initial: string }) {
  const { ids, open, disabled } = useExplorer()
  const [value, setValue] = useState(initial)
  const find = () => {
    if (value.trim() && !disabled)
      open('find_job', { connectionId: ids.connectionId, jobId: value.trim() })
  }
  return (
    <search>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          find()
        }}
      >
        <Input
          name="jobId"
          size="sm"
          variant="soft"
          placeholder="Find a job by exact ID"
          aria-label="Find job by exact ID across queues"
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            find()
          }}
          startAdornment={<Search className="text-tertiary size-4" />}
        />
        <Button
          type="submit"
          color="secondary"
          variant="soft"
          size="sm"
          disabled={disabled || !value.trim()}
        >
          Find job
        </Button>
      </form>
    </search>
  )
}
