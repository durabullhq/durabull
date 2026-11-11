import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  AuthAccountFooter,
  AuthDivider,
  AuthError,
  AuthField,
  AuthHeader,
  AuthLayout,
  AuthLoading,
  authLinkClassName,
  SocialAuthButtons,
} from '@/components/auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const meta = {
  title: 'Web Components/Auth Layout',
  component: AuthLayout,
  parameters: { layout: 'fullscreen' },
  args: {
    footer: (
      <>
        Don't have an account?{' '}
        <a href="#signup" className={authLinkClassName}>
          Sign up
        </a>
      </>
    ),
    children: (
      <>
        <AuthHeader title="Sign in to Durabull" />
        <SocialAuthButtons onSelect={() => {}} />
        <AuthDivider />
        <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
          <AuthField id="story-email" label="Email">
            <Input id="story-email" type="email" placeholder="you@example.com" className="h-9" />
          </AuthField>
          <AuthField id="story-password" label="Password">
            <Input id="story-password" type="password" className="h-9" />
          </AuthField>
          <Button type="submit" className="h-9 w-full">
            Sign in
          </Button>
        </form>
      </>
    ),
  },
} satisfies Meta<typeof AuthLayout>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithError: Story = {
  args: {
    children: (
      <>
        <AuthHeader title="Sign in to Durabull" description="Sign in to accept your invitation." />
        <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
          <AuthField id="story-error-email" label="Email">
            <Input
              id="story-error-email"
              type="email"
              defaultValue="alex@example.com"
              className="h-9"
            />
          </AuthField>
          <AuthField id="story-error-password" label="Password" hint="At least 8 characters.">
            <Input id="story-error-password" type="password" className="h-9" />
          </AuthField>
          <AuthError>Invalid email or password</AuthError>
          <Button type="submit" className="h-9 w-full">
            Sign in
          </Button>
        </form>
      </>
    ),
  },
}

export const SignedInFooter: Story = {
  args: {
    width: 'wide',
    footer: <AuthAccountFooter email="alex@example.com" onSignOut={() => {}} />,
    children: (
      <AuthHeader
        title="Set up your organization"
        description="An organization holds your Redis connections, alert rules, and teammates."
      />
    ),
  },
}

export const Loading: Story = {
  render: () => <AuthLoading label="Loading invitation…" />,
}
