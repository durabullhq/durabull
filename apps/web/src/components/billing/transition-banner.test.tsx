import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TransitionBanner } from '@/components/billing/transition-banner'

const { billingState } = vi.hoisted(() => ({
  billingState: { data: null as Record<string, unknown> | null },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/billing">{children}</a>,
}))
vi.mock('@/hooks/use-billing', () => ({ useBilling: () => ({ data: billingState.data }) }))

const DAY = 86_400_000

function transitionIn(days: number) {
  return {
    deadline: new Date(Date.now() + days * DAY).toISOString(),
    noticeSentAt: new Date().toISOString(),
  }
}

function overview(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    canManageBilling: true,
    transition: transitionIn(20),
    ...overrides,
  }
}

describe('TransitionBanner', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('tells owners the date and links them to choose a plan', () => {
    billingState.data = overview()
    render(<TransitionBanner orgSlug="acme" />)
    expect(screen.getByText('Durabull Cloud is moving to plans')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choose a plan' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See pricing' })).toHaveAttribute(
      'href',
      'https://durabull.io/pricing'
    )
  })

  it('tells other members to ask an owner', () => {
    billingState.data = overview({ canManageBilling: false })
    render(<TransitionBanner orgSlug="acme" />)
    expect(screen.getByText('Ask your organization owner.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Choose a plan' })).not.toBeInTheDocument()
  })

  it('is hidden before the notice, once a plan is chosen, and on self-hosted installs', () => {
    billingState.data = overview({ transition: null })
    const { rerender } = render(<TransitionBanner orgSlug="acme" />)
    expect(screen.queryByTestId('transition-banner')).not.toBeInTheDocument()
    billingState.data = { enabled: false }
    rerender(<TransitionBanner orgSlug="acme" />)
    expect(screen.queryByTestId('transition-banner')).not.toBeInTheDocument()
  })

  it('can be dismissed until the final week, when it stays visible', async () => {
    billingState.data = overview()
    const { unmount } = render(<TransitionBanner orgSlug="acme" />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss until the final week' }))
    expect(screen.queryByTestId('transition-banner')).not.toBeInTheDocument()
    unmount()

    billingState.data = overview({ transition: transitionIn(3) })
    render(<TransitionBanner orgSlug="acme" />)
    expect(screen.getByText('Beta access ends this week')).toBeInTheDocument()
    expect(screen.getByText(/UTC/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Dismiss until the final week' })
    ).not.toBeInTheDocument()
  })
})
