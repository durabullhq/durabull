import type { Meta, StoryObj } from '@storybook/react-vite'
import { AlertRuleSentence } from '@/components/alerts/alert-rule-sentence'

const meta = {
  title: 'Web Components/Alerts/Alert Rule Sentence',
  component: AlertRuleSentence,
  args: {
    tokens: [
      { key: 'queues', label: 'email:receipts', set: true, targetId: 'queues' },
      { key: 'condition', label: '5 failures within 5 minutes', set: true, targetId: 'condition' },
      { key: 'routes', label: 'Operations email', set: true, targetId: 'routes' },
      { key: 'cooldown', label: '30 minute cooldown', set: true, targetId: 'cooldown' },
    ],
  },
} satisfies Meta<typeof AlertRuleSentence>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
