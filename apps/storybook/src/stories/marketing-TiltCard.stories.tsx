import { DrawnCheck, TiltCard } from '@docs/components/v2/tilt-card'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/v2.css'

const meta = {
  title: 'Marketing/V2 / Tilt Card/TiltCard',
  component: TiltCard,
  args: {
    featured: false,
    children: (
      <>
        <h3 className="v2-h text-lg">Self-hosted</h3>
        <p className="mt-2 text-[13.5px] text-[var(--v2-muted)]">
          Docker on your own network, with persistent PGlite or PostgreSQL storage.
        </p>
        <p className="mt-4 flex items-center gap-2 text-[13.5px]">
          <DrawnCheck delay={0.1} />5 Redis connections
        </p>
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div className="max-w-xs p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TiltCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Featured: Story = {
  args: {
    featured: true,
    children: (
      <>
        <h3 className="v2-premium-title v2-h text-lg">Team</h3>
        <p className="mt-2 text-[13.5px] text-[var(--v2-muted)]">
          Shared operations across your environments for one team price.
        </p>
      </>
    ),
  },
}
