import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { RuleTemplateCards } from '@/components/alerts/rule-template-cards'

const meta = {
  title: 'Web Components/Alerts/Rule Template Cards',
  component: RuleTemplateCards,
  args: { linearIntegrationValid: false, onSelectTemplate: fn(), onStartFromScratch: fn() },
} satisfies Meta<typeof RuleTemplateCards>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
