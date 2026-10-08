import { V2LogoMarquee } from '@docs/components/v2/logo-marquee'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Logo Marquee/V2LogoMarquee',
  component: V2LogoMarquee,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2LogoMarquee>
export default meta
export const Default: StoryObj<typeof meta> = {}
