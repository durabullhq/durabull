import type { Meta, StoryObj } from '@storybook/react-vite'
import { AlertCircle, Clock, Inbox, Layers, Plus } from 'lucide-react'
import { useState } from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import { CommandPaletteProvider, useCommandPalette } from '@/components/command-palette'
import { PageTitle } from '@/components/page-title'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CountBadge } from '@/components/ui/count-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Kbd } from '@/components/ui/kbd'
import { Metric, MetricStrip } from '@/components/ui/metric'
import { Panel, PanelHeader, SectionHeader } from '@/components/ui/section'

const meta = { title: 'Foundations/Design System Primitives' } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

function FilterableMetrics() {
  const [status, setStatus] = useState<string | null>('failed')
  const toggle = (next: string) => () => setStatus((current) => (current === next ? null : next))
  return (
    <MetricStrip>
      <Metric
        label="Waiting"
        value="69"
        icon={Clock}
        onClick={toggle('waiting')}
        active={status === 'waiting'}
      />
      <Metric
        label="Prioritized"
        value="4"
        tone="priority"
        onClick={toggle('prioritized')}
        active={status === 'prioritized'}
      />
      <Metric
        label="Active"
        value="12"
        tone="active"
        pulse
        onClick={toggle('active')}
        active={status === 'active'}
      />
      <Metric
        label="Delayed"
        value="67"
        tone="delayed"
        onClick={toggle('delayed')}
        active={status === 'delayed'}
      />
      <Metric
        label="Completed"
        value="48.2K"
        tone="success"
        hint="+1.2K in the last hour"
        onClick={toggle('completed')}
        active={status === 'completed'}
      />
      <Metric
        label="Failed"
        value="31"
        tone="danger"
        emphasis
        onClick={toggle('failed')}
        active={status === 'failed'}
      />
    </MetricStrip>
  )
}

export const Metrics: Story = {
  render: () => (
    <div className="catalog-stack">
      <FilterableMetrics />
      <MetricStrip>
        <Metric label="Workers" value="8" />
        <Metric label="Throughput" value="412/min" loading />
        <Metric label="Oldest waiting" value="2m 14s" tone="warning" emphasis />
      </MetricStrip>
    </div>
  ),
}

export const CountBadges: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <CountBadge value={3} tone="danger" />
      <CountBadge value={12} />
    </div>
  ),
}

export const Titles: Story = {
  render: () => (
    <div className="catalog-stack">
      <PageTitle title="Queues" meta={<Badge variant="neutral">25</Badge>} />
      <PageTitle
        mono
        title="payment-processing"
        crumbs={[{ label: 'Queues', to: '/acme/c/demo-redis' }]}
        meta={<Badge variant="success">Active</Badge>}
      />
    </div>
  ),
}

export const Sections: Story = {
  render: () => (
    <div className="catalog-stack">
      <SectionHeader
        title="Rules"
        count={4}
        description="Evaluated in the background every 30 seconds."
        actions={
          <Button size="xs">
            <Plus className="h-3.5 w-3.5" />
            New rule
          </Button>
        }
      />
      <Panel>
        <PanelHeader>
          <span className="text-[13px] font-medium">Jobs</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Search <Kbd>/</Kbd>
          </span>
        </PanelHeader>
        <EmptyState
          size="inline"
          icon={Inbox}
          title="No jobs match these filters"
          description="Clear the status filter or widen the search."
          actions={
            <Button variant="outline" size="xs">
              Clear filters
            </Button>
          }
        />
      </Panel>
    </div>
  ),
}

export const EmptyStates: Story = {
  render: () => (
    <div className="catalog-stack">
      <EmptyState
        icon={Layers}
        title="No queues found"
        description="No BullMQ queues were detected on this connection. Add a job from your application, then run discovery."
        actions={<Button size="sm">Discover queues</Button>}
      />
      <EmptyState
        icon={AlertCircle}
        tone="danger"
        title="Unable to reach Redis"
        description="The connection refused the request. Check the URL and allowlist."
        actions={
          <Button variant="outline" size="sm">
            Retry
          </Button>
        }
      />
    </div>
  ),
}

function PaletteTrigger() {
  const { open } = useCommandPalette()
  return (
    <Button variant="outline" size="sm" onClick={open}>
      Open command palette <Kbd>⌘K</Kbd>
    </Button>
  )
}

export const CommandPalette: Story = {
  render: () => (
    <CommandPaletteProvider orgSlug="acme">
      <PaletteTrigger />
    </CommandPaletteProvider>
  ),
}

const sidebarUser = { name: 'Alex Morgan', email: 'alex@example.com', avatar: '' }

export const Sidebar: Story = {
  render: () => (
    <CommandPaletteProvider orgSlug="acme">
      <div className="h-[640px] w-60 overflow-hidden rounded-lg border">
        <AppSidebar orgSlug="acme" user={sidebarUser} />
      </div>
    </CommandPaletteProvider>
  ),
}

export const SidebarOnMacDesktop: Story = {
  parameters: { desktop: true },
  render: () => (
    <CommandPaletteProvider orgSlug="acme">
      <div className="h-[640px] w-60 overflow-hidden rounded-lg border">
        <AppSidebar orgSlug="acme" user={sidebarUser} />
      </div>
    </CommandPaletteProvider>
  ),
}
