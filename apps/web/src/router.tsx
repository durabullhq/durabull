import { MutationCache, QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { isSettledError } from './lib/api'
import { routeTree } from './routeTree.gen'

// Helper to check if an error is a 401 unauthorized error
function isUnauthorizedError(error: unknown): boolean {
  return error instanceof Error && 'status' in error && (error as { status: number }).status === 401
}

function isRedisConnectivityError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  const status =
    'status' in error && typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : null

  return (
    status === 503 ||
    status === 504 ||
    message.includes('unable to connect to redis') ||
    message.includes('redis connection unavailable') ||
    message.includes('failed to connect to redis') ||
    message.includes('allowlist') ||
    message.includes('request timed out')
  )
}

// Global handler for 401 responses
function handleUnauthorized() {
  // Clear any cached auth state and redirect to login
  if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
    window.location.href = '/login'
  }
}

/** Delay that folds a burst of mutations (bulk actions) into one plan refresh. */
const PLAN_REFRESH_DELAY_MS = 400

export function getRouter() {
  // Creating, deleting, enabling or disabling a resource changes plan usage
  // and what the plan pauses. Mutations that can do that carry
  // PLAN_USAGE_META; after one succeeds every gate and badge is refreshed.
  // Invoices are left alone: they are read from Stripe.
  let planRefresh: ReturnType<typeof setTimeout> | null = null
  const refreshPlanState = () => {
    if (planRefresh) clearTimeout(planRefresh)
    planRefresh = setTimeout(() => {
      planRefresh = null
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'billing' && query.queryKey[2] !== 'invoices',
      })
    }, PLAN_REFRESH_DELAY_MS)
  }

  const queryClient: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: (_data, _variables, _context, mutation) => {
        if (mutation.meta?.affectsPlanUsage) refreshPlanState()
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 5000,
        retry: (failureCount, error) => {
          // Don't retry on 401 errors
          if (isUnauthorizedError(error)) {
            handleUnauthorized()
            return false
          }

          // A paused seat or connection, or a plan denial, will not change on retry.
          if (isSettledError(error)) {
            return false
          }

          // Surface Redis connectivity issues immediately so the UI shows clear feedback quickly.
          if (isRedisConnectivityError(error)) {
            return false
          }

          // Default retry behavior for other errors
          return failureCount < 3
        },
      },
      mutations: {
        retry: false,
        onError: (error) => {
          // Handle 401 errors in mutations
          if (isUnauthorizedError(error)) {
            handleUnauthorized()
          }
        },
      },
    },
  })

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
