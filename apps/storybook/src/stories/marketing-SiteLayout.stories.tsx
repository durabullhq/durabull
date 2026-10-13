import { PageHeading } from '@docs/components/v2/page-heading'
import { SiteLayout } from '@docs/components/v2/site-layout'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'

const meta = {
  title: 'Marketing/V2 / Layout/SiteLayout',
  component: SiteLayout,
  args: {
    children: (
      <>
        <PageHeading label="Contact" title="Talk to the team.">
          <p>
            From your first Redis connection to a queue that needs a closer look, we’re here to
            help.
          </p>
        </PageHeading>
        <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <h2 className="v2-h text-2xl">How can we help?</h2>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-[var(--v2-muted)]">
            Get help with setup, queue operations, or connecting your agent. Contact, privacy, and
            terms links are available in the shared footer.
          </p>
        </section>
      </>
    ),
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SiteLayout>

export default meta
export const Default: StoryObj<typeof meta> = {}
