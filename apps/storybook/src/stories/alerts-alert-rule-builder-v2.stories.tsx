import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { fn } from 'storybook/test'
import { AlertRuleBuilder } from '@/components/alerts/alert-rule-builder-v2'
import { rule } from '../fixtures/data'

const meta = {
  title: 'Web Components/Alerts/Alert Rule Builder V2',
  component: AlertRuleBuilder,
  args: {
    mode: 'create',
    orgSlug: 'acme',
    connectionId: 'demo-redis',
    connectionName: 'Production',
    availableQueues: ['email:receipts', 'image:resize'],
    onSave: fn(async () => {}),
  },
} satisfies Meta<typeof AlertRuleBuilder>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Edit: Story = {
  args: { mode: 'edit', rule: rule as ComponentProps<typeof AlertRuleBuilder>['rule'] },
}
export const Saving: Story = { args: { isSaving: true } }
