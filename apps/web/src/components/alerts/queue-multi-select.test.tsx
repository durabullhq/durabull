import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { QueueMultiSelect } from '@/components/alerts/queue-multi-select'
import type { QueueFilterMode } from '@/hooks/use-alerts'

function Harness({
  initialMode = 'include',
  initialSelectedQueueNames = [],
}: {
  initialMode?: QueueFilterMode
  initialSelectedQueueNames?: string[]
}) {
  const [queueFilterMode, setQueueFilterMode] = useState<QueueFilterMode>(initialMode)
  const [selectedQueueNames, setSelectedQueueNames] = useState<string[]>(initialSelectedQueueNames)

  return (
    <QueueMultiSelect
      availableQueues={['email-send', 'invoice-send', 'debug-queue']}
      selectedQueueNames={selectedQueueNames}
      onSelectedQueueNamesChange={setSelectedQueueNames}
      queueFilterMode={queueFilterMode}
      onQueueFilterModeChange={setQueueFilterMode}
    />
  )
}

describe('QueueMultiSelect', () => {
  it('filters queues, selects them, and closes when clicking outside', async () => {
    const user = userEvent.setup()

    render(<Harness />)

    await user.click(screen.getByRole('button', { name: /select queue names/i }))
    await user.type(screen.getByPlaceholderText('Search queue names'), 'email')

    expect(screen.getByRole('button', { name: /^email-send$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^invoice-send$/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^email-send$/i }))

    expect(screen.getByRole('button', { name: 'Remove email-send' })).toBeInTheDocument()

    await user.click(document.body)

    expect(screen.queryByPlaceholderText('Search queue names')).not.toBeInTheDocument()
  })

  it('switches between include and exclude modes and clears existing selections', async () => {
    const user = userEvent.setup()

    render(<Harness initialSelectedQueueNames={['email-send']} />)

    expect(screen.getByRole('button', { name: 'Remove email-send' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'All except' }))

    expect(screen.queryByRole('button', { name: 'Remove email-send' })).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'No queues excluded — this rule watches every discovered queue on the connection.'
      )
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /no queues excluded/i }))
    await user.click(screen.getByRole('button', { name: /^debug-queue$/i }))

    expect(screen.getByRole('button', { name: 'Remove debug-queue' })).toBeInTheDocument()
    expect(
      screen.getByText('Select queues to exclude. The rule fires for all other discovered queues.')
    ).toBeInTheDocument()
  })
})
