import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RuleTemplateCards } from '@/components/alerts/rule-template-cards'

describe('RuleTemplateCards', () => {
  it('selects enabled templates and starts from scratch', async () => {
    const user = userEvent.setup()
    const onSelectTemplate = vi.fn()
    const onStartFromScratch = vi.fn()

    render(
      <RuleTemplateCards
        linearIntegrationValid
        onSelectTemplate={onSelectTemplate}
        onStartFromScratch={onStartFromScratch}
      />
    )

    await user.click(screen.getByTestId('rule-template-failure-spike'))
    expect(onSelectTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'failure-spike' })
    )

    await user.click(screen.getByTestId('rule-template-scratch'))
    expect(onStartFromScratch).toHaveBeenCalledTimes(1)
  })

  it('keeps the disabled Linear card focusable and shows its tooltip', async () => {
    const user = userEvent.setup()
    const onSelectTemplate = vi.fn()

    render(
      <RuleTemplateCards
        linearIntegrationValid={false}
        onSelectTemplate={onSelectTemplate}
        onStartFromScratch={vi.fn()}
      />
    )

    const card = screen.getByTestId('rule-template-linear-triage')
    expect(card).toHaveAttribute('aria-disabled', 'true')
    // aria-disabled (not the HTML disabled attribute) keeps it focusable so
    // keyboard users can reach the explanation tooltip.
    expect(card).not.toBeDisabled()

    // Clicking a disabled card must not select the template.
    await user.click(card)
    expect(onSelectTemplate).not.toHaveBeenCalled()

    await user.hover(card)
    await waitFor(() => {
      expect(screen.getAllByText('Connect Linear first').length).toBeGreaterThan(0)
    })
  })
})
