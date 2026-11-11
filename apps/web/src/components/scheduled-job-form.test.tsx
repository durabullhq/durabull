import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScheduledJobForm } from '@/components/scheduled-job-form'

describe('ScheduledJobForm', () => {
  const onSubmit = vi.fn()

  beforeEach(() => {
    onSubmit.mockReset()
    onSubmit.mockResolvedValue(undefined)
  })

  it('submits a fixed-interval scheduler payload in create mode', async () => {
    const user = userEvent.setup()

    render(
      <ScheduledJobForm
        mode="create"
        queueName="emails"
        existingSchedulerIds={[]}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    await user.type(screen.getByLabelText('Job name'), 'Sync Catalog')

    await waitFor(() => {
      expect(screen.getByLabelText('Scheduler ID')).toHaveValue('sync-catalog')
    })

    await user.click(screen.getByRole('button', { name: /Fixed interval/i }))
    await user.clear(screen.getByLabelText('Interval (ms)'))
    await user.type(screen.getByLabelText('Interval (ms)'), '300000')
    await user.clear(screen.getByLabelText('Attempts'))
    await user.type(screen.getByLabelText('Attempts'), '3')

    await user.click(screen.getByRole('button', { name: 'Create scheduled job' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      schedulerId: 'sync-catalog',
      name: 'Sync Catalog',
      data: {},
      schedule: {
        type: 'every',
        everyMs: 300000,
        startDate: undefined,
        endDate: undefined,
        limit: undefined,
      },
      options: {
        attempts: 3,
      },
    })
  })

  it('loads edit state with a locked scheduler id and saves updates', async () => {
    const user = userEvent.setup()

    render(
      <ScheduledJobForm
        mode="edit"
        queueName="emails"
        existingSchedulerIds={['sync-catalog']}
        initialValue={{
          schedulerId: 'sync-catalog',
          jobName: 'Sync Catalog',
          data: { region: 'us-east-1' },
          pattern: '0 * * * *',
          timezone: 'UTC',
          templateOptions: {
            attempts: 2,
          },
        }}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    expect(screen.getByLabelText('Scheduler ID')).toBeDisabled()
    expect(screen.getByLabelText('Scheduler ID')).toHaveValue('sync-catalog')
    expect(screen.getByRole('checkbox')).toBeDisabled()

    await user.clear(screen.getByLabelText('Job name'))
    await user.type(screen.getByLabelText('Job name'), 'Sync Catalog Hourly')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      schedulerId: 'sync-catalog',
      name: 'Sync Catalog Hourly',
      data: { region: 'us-east-1' },
      schedule: {
        type: 'cron',
        pattern: '0 * * * *',
        timezone: 'UTC',
        immediately: false,
        startDate: undefined,
        endDate: undefined,
        limit: undefined,
      },
      options: {
        attempts: 2,
      },
    })
  })

  it('does not invent a timezone when editing a scheduler stored without one', async () => {
    const user = userEvent.setup()

    render(
      <ScheduledJobForm
        mode="edit"
        queueName="emails"
        existingSchedulerIds={['nightly-report']}
        initialValue={{
          schedulerId: 'nightly-report',
          jobName: 'Nightly Report',
          data: {},
          pattern: '0 2 * * *',
          // No timezone stored: BullMQ evaluates the pattern in the worker host's timezone.
        }}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    // The form says so instead of silently showing the browser's timezone.
    const timezone = screen.getByLabelText('Timezone') as HTMLSelectElement
    expect(timezone).toHaveValue('')
    expect(timezone.selectedOptions[0]).toHaveTextContent(/worker host/i)

    // Change something unrelated and save.
    await user.clear(screen.getByLabelText('Job name'))
    await user.type(screen.getByLabelText('Job name'), 'Nightly Report v2')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.schedule).toMatchObject({ type: 'cron', pattern: '0 2 * * *' })
    expect(payload.schedule.timezone).toBeUndefined()
  })

  it('still lets an editor pin a timezone on a scheduler that had none', async () => {
    const user = userEvent.setup()

    render(
      <ScheduledJobForm
        mode="edit"
        queueName="emails"
        existingSchedulerIds={['nightly-report']}
        initialValue={{
          schedulerId: 'nightly-report',
          jobName: 'Nightly Report',
          data: {},
          pattern: '0 2 * * *',
        }}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    await user.selectOptions(screen.getByLabelText('Timezone'), 'UTC')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(onSubmit.mock.calls[0][0].schedule.timezone).toBe('UTC')
  })

  it('defaults a new cron schedule to the browser timezone', async () => {
    render(
      <ScheduledJobForm
        mode="create"
        queueName="emails"
        existingSchedulerIds={[]}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    expect(screen.getByLabelText('Timezone')).toHaveValue(browserTimeZone)
  })
})
