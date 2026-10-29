import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JobDependencies } from './job-dependencies'

const { useDependencies, refetch } = vi.hoisted(() => ({
  useDependencies: vi.fn(),
  refetch: vi.fn(),
}))
vi.mock('@/hooks/use-queues', () => ({ useJobDependencies: useDependencies }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    params,
    search,
    children,
  }: {
    params: Record<string, string>
    search: { tab: string }
    children: React.ReactNode
  }) => (
    <a
      href={`/${params.orgSlug}/c/${params.connectionId}/queues/${params.queueName}/jobs/${encodeURIComponent(params.jobId)}?tab=${search.tab}`}
    >
      {children}
    </a>
  ),
}))

const props = { orgSlug: 'acme', connectionId: 'local', queueName: 'parents', jobId: 'one' }
const data = {
  status: 'waiting-children',
  parent: {
    key: 'bull:root:parent',
    queueName: 'root',
    jobId: 'parent',
    status: 'waiting-children',
  },
  counts: { unprocessed: 2, processed: 1, failed: 0, ignored: 1 },
  children: [
    {
      key: 'bull:child:repeat:key:123',
      queueName: 'child',
      jobId: 'repeat:key:123',
      status: 'failed',
    },
    { key: 'bull:child:gone', queueName: 'child', jobId: 'gone', status: 'unknown' },
    { key: 'other:child:one', queueName: null, jobId: null, status: 'outside-connection' },
  ],
  nextCursor: '18446744073709551615',
}

describe('JobDependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDependencies.mockReturnValue({
      data,
      refetch,
      isLoading: false,
      isFetching: false,
      error: null,
    })
  })

  it('explains blocked parents and links related jobs in the same organization and connection', () => {
    render(<JobDependencies {...props} />)
    expect(screen.getByText(/This job is waiting for 2 pending child jobs/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'child / repeat:key:123' })).toHaveAttribute(
      'href',
      '/acme/c/local/queues/child/jobs/repeat%3Akey%3A123?tab=dependencies'
    )
    expect(screen.getByRole('link', { name: 'root / parent' })).toHaveAttribute(
      'href',
      '/acme/c/local/queues/root/jobs/parent?tab=dependencies'
    )
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Removed or unavailable')).toBeInTheDocument()
    expect(screen.getByText('Outside this connection prefix')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('navigates opaque cursors and resets pagination when the category changes', async () => {
    const user = userEvent.setup()
    render(<JobDependencies {...props} />)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(useDependencies).toHaveBeenLastCalledWith(
      'parents',
      'one',
      'unprocessed',
      data.nextCursor
    )
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(useDependencies).toHaveBeenLastCalledWith('parents', 'one', 'unprocessed', '0')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Ignored failures (1)' }))
    expect(useDependencies).toHaveBeenLastCalledWith('parents', 'one', 'ignored', '0')
    expect(screen.getByText(/ignored by the parent/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Refresh dependencies' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('allows continuation through an empty scan and disables Next when exhausted', () => {
    useDependencies.mockReturnValue({ data: { ...data, children: [] }, refetch })
    const view = render(<JobDependencies {...props} />)
    expect(screen.getByText(/Continue to the next page/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    useDependencies.mockReturnValue({ data: { ...data, children: [], nextCursor: null }, refetch })
    view.rerender(<JobDependencies {...props} />)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('shows an empty state for standalone jobs', () => {
    useDependencies.mockReturnValue({
      data: {
        ...data,
        parent: null,
        children: [],
        counts: { unprocessed: 0, processed: 0, failed: 0, ignored: 0 },
      },
      refetch,
    })
    render(<JobDependencies {...props} />)
    expect(screen.getByText('This job has no parent or child dependencies.')).toBeInTheDocument()
  })

  it('shows loading and recoverable error states', async () => {
    useDependencies.mockReturnValue({ isLoading: true, isFetching: true, refetch })
    const view = render(<JobDependencies {...props} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading dependencies')
    expect(screen.getByRole('button', { name: 'Refresh dependencies' })).toBeDisabled()
    useDependencies.mockReturnValue({ error: new Error('Connection unavailable'), refetch })
    view.rerender(<JobDependencies {...props} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Connection unavailable')
    await userEvent.click(screen.getByRole('button', { name: 'Refresh dependencies' }))
    expect(refetch).toHaveBeenCalledOnce()
  })
})
