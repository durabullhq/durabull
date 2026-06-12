import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueuesDefaultView } from '@/lib/queues-default-view'

const STORAGE_KEY = 'durabull:queues-default-view:v1'

async function importFresh() {
  vi.resetModules()
  return import('@/lib/queues-default-view')
}

describe('queues default view storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('falls back to the standard view when nothing is saved', async () => {
    const { FALLBACK_QUEUES_VIEW, getDefaultQueuesView } = await importFresh()
    expect(getDefaultQueuesView()).toEqual(FALLBACK_QUEUES_VIEW)
  })

  it('round-trips a saved view through localStorage', async () => {
    const view: QueuesDefaultView = {
      q: 'email',
      status: 'paused',
      sortBy: 'failed',
      sortOrder: 'desc',
    }

    const first = await importFresh()
    first.saveDefaultQueuesView(view)

    const second = await importFresh()
    expect(second.getDefaultQueuesView()).toEqual(view)
  })

  it('ignores corrupted or invalid stored values', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const first = await importFresh()
    expect(first.getDefaultQueuesView()).toEqual(first.FALLBACK_QUEUES_VIEW)

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ q: '', status: 'bogus', sortBy: 'nope', sortOrder: 'desc' })
    )
    const second = await importFresh()
    expect(second.getDefaultQueuesView()).toEqual(second.FALLBACK_QUEUES_VIEW)
  })

  it('compares views field by field', async () => {
    const { isSameQueuesView, FALLBACK_QUEUES_VIEW } = await importFresh()
    expect(isSameQueuesView(FALLBACK_QUEUES_VIEW, { ...FALLBACK_QUEUES_VIEW })).toBe(true)
    expect(
      isSameQueuesView(FALLBACK_QUEUES_VIEW, { ...FALLBACK_QUEUES_VIEW, sortOrder: 'desc' })
    ).toBe(false)
  })
})
