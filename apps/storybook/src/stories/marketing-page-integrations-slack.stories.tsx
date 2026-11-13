import type { Meta, StoryObj } from '@storybook/react-vite'
import SlackIntegrationPage from '../../../docs/app/integrations/slack/page'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Pages/Slack Integration',
  component: SlackIntegrationPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SlackIntegrationPage>
export default meta
export const Default: StoryObj<typeof meta> = {}
