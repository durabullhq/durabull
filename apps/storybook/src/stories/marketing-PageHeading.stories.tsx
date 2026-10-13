import { PageHeading } from '@docs/components/v2/page-heading'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'

const meta = {
  title: 'Marketing/V2 / Layout/PageHeading',
  component: PageHeading,
  args: {
    label: 'Contact',
    title: 'Talk to the team.',
    children: (
      <p>
        From your first Redis connection to a queue that needs a closer look, we’re here to help.
      </p>
    ),
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PageHeading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Privacy: Story = {
  args: {
    label: 'Legal · Durabull',
    title: 'Privacy Policy',
    children: (
      <>
        <p>
          How Durabull collects, uses, shares, and retains data across its website, Cloud service,
          and BullMQ &amp; Redis plugin, and the controls available to you.
        </p>
        <p className="v2-mono mt-5 text-[var(--v2-muted)]">
          Last updated: <time dateTime="2026-10-09">October 9, 2026</time>
        </p>
      </>
    ),
  },
}
export const Terms: Story = {
  args: {
    label: 'Legal · Durabull',
    title: 'Terms of Service',
    children: <p>Simple guidelines for using Durabull responsibly during the beta.</p>,
  },
}
