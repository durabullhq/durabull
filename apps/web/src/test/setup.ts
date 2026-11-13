import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { resetTestEntitlement, testEntitlement } from './entitlement'

// Plan state comes from the server; component tests get an unrestricted
// entitlement unless they choose a plan with setTestEntitlement.
vi.mock('@/hooks/use-entitlement', () => ({
  useEntitlement: () => testEntitlement.current,
  useFeature: (feature: Parameters<typeof testEntitlement.current.feature>[0]) => ({
    ...testEntitlement.current.feature(feature),
    canManageBilling: testEntitlement.current.canManageBilling,
  }),
  useCapacity: (limit: Parameters<typeof testEntitlement.current.capacity>[0]) => ({
    ...testEntitlement.current.capacity(limit),
    canManageBilling: testEntitlement.current.canManageBilling,
  }),
}))

afterEach(() => {
  cleanup()
  resetTestEntitlement()
})

// jsdom lacks layout APIs that Radix popper-based components (dropdowns,
// tooltips) require, so stub them to let the real components render in tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {}
}
