import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  CopyButton,
  LocalInstallNotice,
  SettingsLayout,
  SettingsPage,
} from '@/components/settings/settings-layout'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/section'

const meta = {
  title: 'Web Components/Settings/Settings Layout',
  component: SettingsLayout,
  args: {
    orgSlug: 'acme',
    children: (
      <SettingsPage
        title="This install"
        description="Include these details when you report a problem."
        actions={
          <Button variant="outline" size="xs">
            Copy details
          </Button>
        }
      >
        <Panel>
          <dl className="divide-y text-[13px]">
            {[
              ['Version', '1.45.0'],
              ['Build', '8f3c2d1'],
            ].map(([label, value]) => (
              <div key={label} className="flex min-h-10 items-center gap-3 px-4 py-1.5">
                <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
                <dd className="min-w-0 flex-1 font-mono">{value}</dd>
                <CopyButton value={value} label={label.toLowerCase()} />
              </div>
            ))}
          </dl>
        </Panel>
      </SettingsPage>
    ),
  },
} satisfies Meta<typeof SettingsLayout>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
/** What a page about people or sign-in shows on an install without accounts. */
export const LocalInstall: Story = { args: { children: <LocalInstallNotice /> } }
