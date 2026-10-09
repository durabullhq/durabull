import { Alert } from '@openai/apps-sdk-ui/components/Alert'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { CollapseLg, ExpandLg, Reload } from '@openai/apps-sdk-ui/components/Icon'
import { LoadingIndicator } from '@openai/apps-sdk-ui/components/Indicator'
import { ShimmerText } from '@openai/apps-sdk-ui/components/ShimmerText'
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { ErrorNotice, ExplorerProvider, Payload } from './components'
import type { Explorer } from './explorer'
import { dotted, fmt, num, obj, str, time } from './format'
import { ConnectionNav } from './nav'
import { refreshToolCall } from './read-tools'
import { renderView } from './views/registry'

export function Shell({ explorer }: { explorer: Explorer }) {
  const state = useSyncExternalStore(explorer.subscribe, explorer.getState)
  const root = useRef<HTMLDivElement>(null)
  const { view, busy, host } = state
  const connectionId = view?.data.connectionId ?? view?.args.connectionId
  const disabled = !state.connected || busy !== false
  const viewKey = view && `${view.tool}:${JSON.stringify(view.args)}:${view.updatedAt.getTime()}`

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
  const redactions = num(obj(view?.data._mcpSafety).redactionCount)
  const nav =
    view && connectionId ? (
      <ConnectionNav
        key={viewKey}
        current={view.tool}
        jobId={view.tool === 'find_job' ? str(view.data.jobId) : ''}
      />
    ) : null

  return (
    <ExplorerProvider value={{ explorer, state, ids: { connectionId }, nav }}>
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
            key={viewKey}
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
            <Payload label="Structured response" value={view.data} />
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
          <output className="min-w-0 truncate">
            {busy ? (
              <ShimmerText as="span">
                {busy === 'ask' ? 'Sending to your assistant…' : 'Loading the latest snapshot…'}
              </ShimmerText>
            ) : (
              dotted(
                'Scoped access',
                redactions
                  ? `${fmt(redactions)} sensitive values redacted`
                  : 'Sensitive values redacted',
                view && `Updated ${time(view.updatedAt)}`
              )
            )}
          </output>
          <span className="flex shrink-0 items-center gap-0.5">
            {refresh ? (
              <Tooltip content="Refresh" compact>
                <Button
                  color="secondary"
                  variant="ghost"
                  size="xs"
                  uniform
                  aria-label="Refresh"
                  disabled={disabled}
                  onClick={() => void explorer.load(refresh.name, refresh.arguments ?? {}, false)}
                >
                  <Reload />
                </Button>
              </Tooltip>
            ) : null}
            {canExpand ? (
              <Tooltip content={fullscreen ? 'Collapse' : 'Expand'} compact>
                <Button
                  color="secondary"
                  variant="ghost"
                  size="xs"
                  uniform
                  aria-label={fullscreen ? 'Collapse' : 'Expand'}
                  disabled={!state.connected}
                  onClick={() => void explorer.toggleDisplayMode()}
                >
                  {fullscreen ? <CollapseLg /> : <ExpandLg />}
                </Button>
              </Tooltip>
            ) : null}
          </span>
        </footer>
      </div>
    </ExplorerProvider>
  )
}
