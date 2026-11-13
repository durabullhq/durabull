import { RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { SlackDestinationConfig, SlackMentionMode } from '@/hooks/use-alerts'
import { type SlackChannelRecord, useSlackChannels, useSlackUserGroups } from '@/hooks/use-slack'
import { parseSlackChannelId } from '@/lib/slack-destination'

const NO_CHANNELS: SlackChannelRecord[] = []

const MENTION_OPTIONS: Array<{ value: SlackMentionMode; label: string }> = [
  { value: 'none', label: 'No broadcast mention' },
  { value: 'here', label: '@here (active members)' },
  { value: 'channel', label: '@channel (everyone)' },
]

/** Channel, mention and threading settings for a Slack alert destination. */
export function SlackDestinationFields({
  config,
  onChange,
  idPrefix = 'slack-destination',
  compact = false,
}: {
  config: Partial<SlackDestinationConfig>
  onChange: (config: Partial<SlackDestinationConfig>) => void
  idPrefix?: string
  /** Channel picker only (used inline on the Slack integration card). */
  compact?: boolean
}) {
  const channelsQuery = useSlackChannels(true)
  const userGroupsQuery = useSlackUserGroups(!compact)
  const [filter, setFilter] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [manualId, setManualId] = useState('')

  const channels = channelsQuery.data?.channels ?? NO_CHANNELS
  // Very large workspaces list only their first channels; any other channel
  // can still be chosen by its ID (the API checks it when saving).
  const truncated = channelsQuery.data?.truncated === true
  const filtered = useMemo(() => {
    const query = filter.trim().replace(/^#/, '').toLowerCase()
    const matching = query
      ? channels.filter((channel) => channel.name.toLowerCase().includes(query))
      : channels
    // Keep the selected channel visible while filtering.
    const selected = channels.find((channel) => channel.id === config.channelId)
    return selected && !matching.includes(selected) ? [selected, ...matching] : matching
  }, [channels, filter, config.channelId])

  const selectedChannel = channels.find((channel) => channel.id === config.channelId)
  // A saved channel that is not in the listed page (entered by ID).
  const unlistedChannelId = config.channelId && !selectedChannel ? config.channelId : null
  const userGroups = userGroupsQuery.data?.userGroups ?? []
  const selectedGroups = config.userGroupIds ?? []
  const parsedManualId = parseSlackChannelId(manualId)

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${idPrefix}-channel`}>Channel</Label>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={async () => {
              setRefreshing(true)
              setRefreshError(null)
              try {
                await channelsQuery.refresh()
              } catch (error) {
                setRefreshError(
                  error instanceof Error && error.message
                    ? `Could not reload channels: ${error.message}`
                    : 'Could not reload channels. Try again.'
                )
              } finally {
                setRefreshing(false)
              }
            }}
            disabled={refreshing || channelsQuery.isLoading}
            aria-label="Reload Slack channels"
          >
            <RefreshCw className={refreshing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Reload
          </Button>
        </div>
        {channels.length > 12 ? (
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter channels"
            aria-label="Filter Slack channels"
          />
        ) : null}
        <Select
          id={`${idPrefix}-channel`}
          value={config.channelId ?? ''}
          disabled={channelsQuery.isLoading || channelsQuery.isError}
          onChange={(event) => {
            const channel = channels.find((candidate) => candidate.id === event.target.value)
            onChange({ ...config, channelId: channel?.id, channelName: channel?.name })
          }}
        >
          <option value="">
            {channelsQuery.isLoading
              ? 'Loading channels…'
              : channelsQuery.isError
                ? 'Channels unavailable'
                : 'Choose a channel'}
          </option>
          {unlistedChannelId ? (
            <option value={unlistedChannelId}># {config.channelName ?? unlistedChannelId}</option>
          ) : null}
          {filtered.map((channel) => (
            <option
              key={channel.id}
              value={channel.id}
              disabled={channel.isPrivate && !channel.isMember}
            >
              {channel.isPrivate ? '🔒 ' : '# '}
              {channel.name}
              {channel.isPrivate && !channel.isMember ? ' (invite @Durabull first)' : ''}
            </option>
          ))}
        </Select>
        {truncated ? (
          <div className="space-y-1.5 rounded-md border border-dashed px-3 py-2">
            <p className="text-xs text-muted-foreground">
              This workspace has more channels than Durabull lists. If yours is missing, paste its
              channel ID (in Slack: channel name → About → Channel ID).
            </p>
            <div className="flex gap-2">
              <Input
                value={manualId}
                onChange={(event) => setManualId(event.target.value)}
                placeholder="C0123456789"
                aria-label="Slack channel ID"
                className="max-w-xs font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={!parsedManualId}
                onClick={() => {
                  if (!parsedManualId) return
                  const listed = channels.find((channel) => channel.id === parsedManualId)
                  onChange({ ...config, channelId: parsedManualId, channelName: listed?.name })
                  setManualId('')
                }}
              >
                Use channel
              </Button>
            </div>
          </div>
        ) : null}
        {refreshError ? (
          <p className="text-xs text-status-danger" role="alert">
            {refreshError}
          </p>
        ) : null}
        {channelsQuery.isError ? (
          <p className="text-xs text-status-danger">
            {channelsQuery.error instanceof Error
              ? channelsQuery.error.message
              : 'Could not load Slack channels.'}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {selectedChannel?.isPrivate
              ? 'Private channel: Durabull is a member and can post here.'
              : 'Durabull can post to any public channel. For a private channel, run /invite @Durabull in it, then reload.'}
          </p>
        )}
      </div>

      {compact ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-mention`}>Notify</Label>
              <Select
                id={`${idPrefix}-mention`}
                value={config.mention ?? 'none'}
                onChange={(event) =>
                  onChange({ ...config, mention: event.target.value as SlackMentionMode })
                }
              >
                {MENTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">Added to new incidents only.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-groups`}>Mention user groups</Label>
              <Select
                id={`${idPrefix}-groups`}
                value=""
                disabled={userGroups.length === 0 || selectedGroups.length >= 5}
                onChange={(event) => {
                  const id = event.target.value
                  if (!id || selectedGroups.includes(id)) return
                  onChange({ ...config, userGroupIds: [...selectedGroups, id] })
                }}
              >
                <option value="">
                  {userGroupsQuery.isLoading
                    ? 'Loading groups…'
                    : userGroupsQuery.isError
                      ? 'User groups unavailable'
                      : userGroups.length === 0
                        ? 'No user groups in this workspace'
                        : 'Add a group, e.g. @oncall'}
                </option>
                {userGroups.flatMap((group) =>
                  selectedGroups.includes(group.id)
                    ? []
                    : [
                        <option key={group.id} value={group.id}>
                          @{group.handle} ({group.name})
                        </option>,
                      ]
                )}
              </Select>
              {userGroupsQuery.isError ? (
                <p className="text-xs text-status-danger">
                  Could not load Slack user groups.{' '}
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => void userGroupsQuery.refetch()}
                  >
                    Try again
                  </button>
                </p>
              ) : null}
              {selectedGroups.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedGroups.map((id) => {
                    const group = userGroups.find((candidate) => candidate.id === id)
                    return (
                      <Badge key={id} variant="outline" className="gap-1">
                        @{group?.handle ?? id}
                        <button
                          type="button"
                          className="ml-0.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                          onClick={() =>
                            onChange({
                              ...config,
                              userGroupIds: selectedGroups.filter((groupId) => groupId !== id),
                            })
                          }
                          aria-label={`Remove @${group?.handle ?? id}`}
                        >
                          ×
                        </button>
                      </Badge>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <label className="flex items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-input accent-foreground"
              checked={config.threadUpdates !== false}
              onChange={(event) => onChange({ ...config, threadUpdates: event.target.checked })}
            />
            <span>
              Post acknowledgements and resolutions as thread replies
              <span className="block text-xs text-muted-foreground">
                The alert message itself always updates to show the current state.
              </span>
            </span>
          </label>
        </>
      )}
    </div>
  )
}
