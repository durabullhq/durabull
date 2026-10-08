import type { Meta, StoryObj } from '@storybook/react-vite'
import HomePage from '../../../docs/app/(home)/page'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Pages/Home',
  component: HomePage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HomePage>
export default meta
export const Default: StoryObj<typeof meta> = {}
