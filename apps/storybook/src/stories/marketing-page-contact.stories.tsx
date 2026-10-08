import type { Meta, StoryObj } from '@storybook/react-vite'
import Page from '../../../docs/app/contact/page'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Pages/Contact',
  component: Page,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Page>
export default meta
export const Default: StoryObj<typeof meta> = {}
