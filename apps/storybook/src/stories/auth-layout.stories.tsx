import type { Meta, StoryObj } from '@storybook/react-vite'
import { AuthLayout } from '@/components/auth-layout'
import { Button } from '@/components/ui/button'

const meta = {
  title: 'Web Components/Auth Layout',
  component: AuthLayout,
  args: {
    children: (
      <div className="catalog-panel">
        <h2>Welcome back</h2>
        <p>Sign in to your queue operations workspace.</p>
        <Button className="mt-4">Continue</Button>
      </div>
    ),
  },
} satisfies Meta<typeof AuthLayout>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
