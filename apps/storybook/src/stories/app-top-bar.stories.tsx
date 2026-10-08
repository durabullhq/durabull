import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AppTopBar, useAppTopBar } from '@/components/app-top-bar'
import { Button } from '@/components/ui/button'

const meta = {
  title: 'Web Components/App Top Bar',
  component: AppTopBar,
  render: (args) => <TopBarExample {...args} />,
  args: { onOpenMobileNav: fn() },
} satisfies Meta<typeof AppTopBar>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

function TopBarExample(args: React.ComponentProps<typeof AppTopBar>) {
  useAppTopBar({
    left: <h1 className="font-semibold">Queue operations</h1>,
    actions: <Button size="sm">Add job</Button>,
  })
  return <AppTopBar {...args} />
}
