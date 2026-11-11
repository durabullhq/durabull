import type {
  BillingInterval,
  CapacityLimitKey,
  PurchasablePlanCode,
} from '@durabull/api-client/billing'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, handleRes, type InferResponseType } from '@/lib/api'
import { useActiveOrganization } from './use-organization'

export type BillingOverview = InferResponseType<(typeof api.billing)['$get'], 200>
export type EnabledBillingOverview = Extract<BillingOverview, { enabled: true }>

export const billingKeys = {
  all: ['billing'] as const,
  overview: (organizationId: string | undefined) => ['billing', organizationId ?? 'none'] as const,
  entitlement: (organizationId: string | undefined) =>
    ['billing', organizationId ?? 'none', 'entitlement'] as const,
  invoices: (organizationId: string | undefined) =>
    ['billing', organizationId ?? 'none', 'invoices'] as const,
}

/**
 * Current organization's plan, limits, usage and billing status. Returning
 * from Checkout confirms the session on the server, which reconciles with
 * Stripe before access changes, so the overview does not need to poll.
 */
export function useBilling(options: { enabled?: boolean } = {}) {
  const { data: activeOrganization } = useActiveOrganization()
  return useQuery({
    queryKey: billingKeys.overview(activeOrganization?.id),
    queryFn: async () => handleRes<BillingOverview>(await api.billing.$get()),
    enabled: options.enabled !== false && Boolean(activeOrganization?.id),
  })
}

/**
 * Reconciling with Stripe can change the plan, which pauses or restores
 * connections, rules, destinations, members and service accounts. Refresh
 * everything, not only billing, so no page keeps a stale paused state.
 */
function useInvalidateAfterReconcile() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries()
}

export function useStartCheckout() {
  return useMutation({
    mutationFn: async (input: {
      plan: PurchasablePlanCode
      interval: BillingInterval
      trial?: boolean
    }) =>
      handleRes<{ url: string; reused: boolean }>(
        await api.billing.checkout.$post({ json: input })
      ),
    onSuccess: ({ url }) => {
      window.location.assign(url)
    },
  })
}

export function useConfirmCheckout() {
  const invalidate = useInvalidateAfterReconcile()
  return useMutation({
    mutationFn: async (sessionId: string) =>
      handleRes<{ status: string }>(
        await api.billing.checkout.confirm.$post({ json: { sessionId } })
      ),
    onSettled: invalidate,
  })
}

export function useCancelCheckout() {
  const invalidate = useInvalidateAfterReconcile()
  return useMutation({
    mutationFn: async () =>
      handleRes<{ status: string }>(await api.billing.checkout.cancel.$post()),
    onSettled: invalidate,
  })
}

/** Where the hosted Customer Portal opens; Stripe shows that screen directly when it can. */
export type PortalRequest =
  | { intent?: 'manage' | 'payment_method' | 'cancel' }
  | { intent: 'change_plan'; plan?: PurchasablePlanCode; interval?: BillingInterval }

export function useOpenBillingPortal() {
  return useMutation({
    mutationFn: async (request: PortalRequest | undefined) =>
      handleRes<{ url: string }>(await api.billing.portal.$post({ json: request ?? {} })),
    onSuccess: ({ url }) => {
      window.location.assign(url)
    },
  })
}

export type BillingInvoices = InferResponseType<(typeof api.billing.invoices)['$get'], 200>
export type BillingInvoice = BillingInvoices['invoices'][number]

/** Recent invoices with Stripe-hosted links. Owner only; fetched from Stripe on demand. */
export function useBillingInvoices(options: { enabled: boolean }) {
  const { data: activeOrganization } = useActiveOrganization()
  return useQuery({
    queryKey: billingKeys.invoices(activeOrganization?.id),
    queryFn: async () => handleRes<BillingInvoices>(await api.billing.invoices.$get()),
    enabled: options.enabled && Boolean(activeOrganization?.id),
    staleTime: 60_000,
    retry: 1,
  })
}

export function useRefreshBilling() {
  const invalidate = useInvalidateAfterReconcile()
  return useMutation({
    mutationFn: async () => handleRes<{ planCode: string }>(await api.billing.refresh.$post()),
    onSettled: invalidate,
  })
}

export function useSaveCapacityAllocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (keep: Partial<Record<CapacityLimitKey, string[]>>) =>
      handleRes<{ suspended: number; restored: number }>(
        await api.billing.allocation.$put({ json: { keep } })
      ),
    onSettled: () => queryClient.invalidateQueries(),
  })
}

export function reportUpgradePromptShown(input: { feature?: string; limit?: string }): void {
  void api.billing.events['upgrade-prompt'].$post({ json: input }).catch(() => {})
}
