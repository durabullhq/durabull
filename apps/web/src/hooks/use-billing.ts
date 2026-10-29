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

function useInvalidateBilling() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: billingKeys.all })
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
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: async (sessionId: string) =>
      handleRes<{ status: string }>(
        await api.billing.checkout.confirm.$post({ json: { sessionId } })
      ),
    onSettled: invalidate,
  })
}

export function useCancelCheckout() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: async () =>
      handleRes<{ status: string }>(await api.billing.checkout.cancel.$post()),
    onSettled: invalidate,
  })
}

export function useOpenBillingPortal() {
  return useMutation({
    mutationFn: async () => handleRes<{ url: string }>(await api.billing.portal.$post()),
    onSuccess: ({ url }) => {
      window.location.assign(url)
    },
  })
}

export function useRefreshBilling() {
  const invalidate = useInvalidateBilling()
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
