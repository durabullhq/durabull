import { Footer } from '@docs/components/footer'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Footer/Footer',
  component: Footer,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Footer>
export default meta
export const Default: StoryObj<typeof meta> = {}
