import { Alert } from '@openai/apps-sdk-ui/components/Alert'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { CollapseLg, ExpandLg, Home, Reload } from '@openai/apps-sdk-ui/components/Icon'
import { LoadingIndicator } from '@openai/apps-sdk-ui/components/Indicator'
import { ShimmerText } from '@openai/apps-sdk-ui/components/ShimmerText'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { ErrorNotice, ExplorerProvider } from './components'
import type { Explorer } from './explorer'
import { fmt, num, obj, time } from './format'
import { refreshToolCall } from './read-tools'
import { renderView } from './views/render-view'

/** Views that already show connection navigation chips. */
const NAV_VIEWS = new Set([
  'get_connection_overview',
  'list_queues',
  'get_workers',
  'get_alert_summary',
  'get_failure_events',
  'list_alert_rules',
  'get_redis_health',
])

export function Shell({ explorer }: { explorer: Explorer }) {
  const state = useSyncExternalStore(explorer.subscribe, explorer.getState)
  const root = useRef<HTMLDivElement>(null)
  const { view, busy, host } = state
  const connectionId = view?.data.connectionId ?? view?.args.connectionId
  const disabled = !state.connected || busy !== false

  // Move focus to the newest status, error or heading after navigation, not on first paint.
  useEffect(() => {
    if (!state.focus) return
    const target = root.current?.querySelector<HTMLElement>('[role="alert"], output, h1')
    if (target) {
      target.tabIndex = -1
      target.focus({ preventScroll: true })
    }
  }, [state.focus])

  const refresh = view
    ? refreshToolCall(view.tool, view.args)
    : { name: 'list_connections', arguments: {} }
  const fullscreen = host?.displayMode === 'fullscreen'
  const canExpand = host?.availableDisplayModes?.includes('fullscreen')
  const showOverview =
    connectionId &&
    view &&
    !NAV_VIEWS.has(view.tool) &&
    !(view.tool === 'list_scheduled_jobs' && !view.args.queueName)
  const redactions = num(obj(view?.data._mcpSafety).redactionCount)

  return (
    <ExplorerProvider value={{ explorer, state, args: { connectionId } }}>
      <div
        ref={root}
        className={`mx-auto flex w-full flex-col gap-4 p-4 ${fullscreen ? 'max-w-3xl' : ''}`}
      >
        {state.error ? (
          <ErrorNotice
            message={state.error}
            onRetry={state.failedRead ? explorer.retry : undefined}
          />
        ) : null}
        {state.notice ? (
          <output className="block">
            <Alert color="success" variant="soft" description={state.notice} />
          </output>
        ) : null}
        {view ? (
          <div
            key={`${view.tool}:${JSON.stringify(view.args)}:${view.updatedAt.getTime()}`}
            aria-busy={busy === 'read'}
            className={`flex flex-col gap-4 transition-opacity ${busy === 'read' ? 'pointer-events-none opacity-50' : ''}`}
          >
            {renderView(view)}
            {view.data.nextCursor ? (
              <div>
                <Button
                  color="secondary"
                  variant="soft"
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    void explorer.load(view.tool, { ...view.args, cursor: view.data.nextCursor })
                  }
                >
                  Next page
                </Button>
              </div>
            ) : null}
          </div>
        ) : state.error ? null : (
          <output className="text-secondary flex items-center justify-center gap-2 py-10 text-sm">
            <LoadingIndicator size={16} />
            {state.connected
              ? 'Waiting for the result. Refresh if the host opened this view without data.'
              : 'Connecting to Durabull…'}
          </output>
        )}
        <footer className="border-subtle text-tertiary flex min-h-8 items-center justify-between gap-2 border-t pt-3 text-xs">
          <span className="min-w-0 truncate">
            {busy ? (
              <ShimmerText as="span">
                {busy === 'ask' ? 'Sending to your assistant…' : 'Loading the latest snapshot…'}
              </ShimmerText>
            ) : view ? (
              [
                `Durabull · Updated ${time(view.updatedAt)}`,
                redactions ? `${fmt(redactions)} values redacted` : '',
              ]
                .filter(Boolean)
                .join(' · ')
            ) : (
              'Durabull'
            )}
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            {showOverview ? (
              <Button
                color="secondary"
                variant="ghost"
                size="xs"
                disabled={disabled}
                onClick={() => void explorer.load('get_connection_overview', { connectionId })}
              >
                <Home />
                Overview
              </Button>
            ) : null}
            {refresh ? (
              <Button
                color="secondary"
                variant="ghost"
                size="xs"
                uniform
                aria-label="Refresh"
                title="Refresh"
                disabled={disabled}
                onClick={() => void explorer.load(refresh.name, refresh.arguments ?? {}, false)}
              >
                <Reload />
              </Button>
            ) : null}
            {canExpand ? (
              <Button
                color="secondary"
                variant="ghost"
                size="xs"
                uniform
                aria-label={fullscreen ? 'Collapse' : 'Expand'}
                title={fullscreen ? 'Collapse' : 'Expand'}
                disabled={!state.connected}
                onClick={() => void explorer.toggleDisplayMode()}
              >
                {fullscreen ? <CollapseLg /> : <ExpandLg />}
              </Button>
            ) : null}
          </span>
        </footer>
      </div>
    </ExplorerProvider>
  )
}
