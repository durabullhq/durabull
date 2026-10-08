import type { Meta, StoryObj } from '@storybook/react-vite'
import Page from '../../../docs/app/terms/page'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Pages/Terms',
  component: Page,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Page>
export default meta
export const Default: StoryObj<typeof meta> = {}
