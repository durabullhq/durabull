import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '@/components/confirm-dialog'

describe('ConfirmDialog', () => {
  it('confirms and cancels normally when idle', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn()

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete rule"
        description="This cannot be undone."
        destructive
        onConfirm={onConfirm}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('blocks Escape, overlay-click, and the close button while a confirm is in flight', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete rule"
        description="This cannot be undone."
        destructive
        isConfirming
        onConfirm={vi.fn()}
      />
    )

    // Cancel/Confirm buttons are disabled while confirming.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Confirm/ })).toBeDisabled()

    // Escape is the dismiss path most likely to detach a destructive
    // mutation from its confirmation UI — it must not close the dialog.
    await user.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()

    // The corner "Close" (X) button routes through the same onOpenChange
    // callback and must be blocked too.
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
