import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  CapacityCount,
  FeaturePlanBadge,
  FeatureUpgradeNote,
  LimitReachedNote,
} from '@/components/billing/plan-access'
import { setTestEntitlement } from '@/test/entitlement'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/billing">{children}</a>,
  useParams: () => ({ orgSlug: 'acme' }),
}))

describe('plan access components', () => {
  it('stay out of the way on self-hosted deployments', () => {
    const { container } = render(
      <>
        <FeatureUpgradeNote feature="alerts.webhook" />
        <FeaturePlanBadge feature="alerts.webhook" />
        <LimitReachedNote limit="connections.enabled" />
        <CapacityCount limit="connections.enabled" />
      </>
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('stay out of the way when the plan includes the feature and has room', () => {
    setTestEntitlement({ plan: 'team', usage: { 'connections.enabled': 2 } })
    render(
      <>
        <FeatureUpgradeNote feature="alerts.webhook" />
        <FeaturePlanBadge feature="alerts.webhook" />
        <LimitReachedNote limit="connections.enabled" />
        <CapacityCount limit="connections.enabled" />
      </>
    )
    expect(screen.queryByTestId('feature-upgrade-note')).not.toBeInTheDocument()
    expect(screen.queryByTestId('plan-badge')).not.toBeInTheDocument()
    expect(screen.queryByTestId('limit-reached-note')).not.toBeInTheDocument()
    expect(screen.getByTestId('capacity-count')).toHaveTextContent('2 of 5')
  })

  it('name the plan a missing feature needs and send the owner to upgrade', () => {
    setTestEntitlement({ plan: 'free' })
    render(
      <>
        <FeatureUpgradeNote feature="alerts.webhook" />
        <FeaturePlanBadge feature="alerts.webhook" />
      </>
    )
    expect(screen.getByTestId('feature-upgrade-note')).toHaveTextContent(
      'is part of the Team plan.'
    )
    expect(screen.getByRole('link', { name: 'Upgrade to Team' })).toBeInTheDocument()
    expect(screen.getByTestId('plan-badge')).toHaveTextContent('Team')
  })

  it('tell members who cannot change the plan to ask the owner', () => {
    setTestEntitlement({ plan: 'free', canManageBilling: false })
    render(<FeatureUpgradeNote feature="alerts.webhook" />)
    expect(screen.getByTestId('feature-upgrade-note')).toHaveTextContent(
      'Ask your organization owner to upgrade.'
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('explain a reached limit and the plan with more room', () => {
    setTestEntitlement({ plan: 'free', usage: { 'connections.enabled': 1 } })
    render(
      <>
        <LimitReachedNote limit="connections.enabled" />
        <CapacityCount limit="connections.enabled" />
      </>
    )
    expect(screen.getByTestId('limit-reached-note')).toHaveTextContent(
      'Your plan includes 1 connection and all are in use.'
    )
    expect(screen.getByRole('link', { name: 'Upgrade to Team' })).toBeInTheDocument()
    expect(screen.getByTestId('capacity-count')).toHaveTextContent('1 of 1')
  })

  it('say a resource is not part of the plan when the limit is zero', () => {
    setTestEntitlement({ plan: 'free' })
    render(<LimitReachedNote limit="service_accounts.enabled" />)
    expect(screen.getByTestId('limit-reached-note')).toHaveTextContent(
      'Your plan does not include service accounts.'
    )
  })

  it('point to plans rather than a self-serve upgrade above Business', () => {
    setTestEntitlement({ plan: 'business', usage: { 'service_accounts.enabled': 99 } })
    render(<LimitReachedNote limit="service_accounts.enabled" />)
    expect(screen.getByRole('link', { name: 'View plans' })).toBeInTheDocument()
  })
})
