import {
  AddToSlackButton,
  SlackHero,
  SlackSecurity,
} from '@docs/components/integrations/slack-landing'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Slack/AddToSlackButton',
  component: AddToSlackButton,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AddToSlackButton>
export default meta
type Story = StoryObj<typeof meta>
export const Button: Story = {}
export const Hero: Story = { render: () => <SlackHero /> }
export const Security: Story = { render: () => <SlackSecurity /> }
