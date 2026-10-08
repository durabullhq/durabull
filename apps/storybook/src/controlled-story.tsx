import type { Decorator } from '@storybook/react-vite'
import { useArgs } from 'storybook/preview-api'

/** Keep production controlled inputs editable while syncing the Controls panel. */
const bindings: Record<string, string> = {
  onChange: 'value',
  onOpenChange: 'open',
  onSelectedDestinationIdsChange: 'selectedDestinationIds',
  onSelectedQueueNamesChange: 'selectedQueueNames',
  onQueueFilterModeChange: 'queueFilterMode',
  onStatusChange: 'status',
  onWindowChange: 'selectedWindow',
  onSearchChange: 'search',
  onStatusFilterChange: 'statusFilter',
}
export const controlledStory: Decorator = (Story) => {
  const [args, updateArgs] = useArgs()
  const callbacks: Record<string, (...values: unknown[]) => void> = {}
  for (const [callback, prop] of Object.entries(bindings)) {
    if (typeof args[callback] !== 'function' || !(prop in args)) continue
    callbacks[callback] = (...values: unknown[]) => {
      args[callback](...values)
      updateArgs({ [prop]: values[0] })
    }
  }
  return <Story args={{ ...args, ...callbacks }} />
}
