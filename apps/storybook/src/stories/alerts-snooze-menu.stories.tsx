import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { SnoozeMenu } from '@/components/alerts/snooze-menu'
import { rule } from '../fixtures/data'

const meta = {
  title: 'Web Components/Alerts/Snooze Menu',
  component: SnoozeMenu,
  args: { rule: rule as ComponentProps<typeof SnoozeMenu>['rule'], connectionId: 'demo-redis' },
} satisfies Meta<typeof SnoozeMenu>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
