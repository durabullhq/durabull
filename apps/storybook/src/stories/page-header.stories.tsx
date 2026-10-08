import type { Meta, StoryObj } from '@storybook/react-vite'
import { Database } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'

const meta = {
  title: 'Web Components/Page Header',
  component: PageHeader,
  args: {
    title: 'Queue operations',
    description: 'Monitor throughput and recover failed work.',
    icon: Database,
    actions: <Button>Add job</Button>,
  },
} satisfies Meta<typeof PageHeader>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
