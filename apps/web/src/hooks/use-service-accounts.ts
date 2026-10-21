import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, handleRes, type InferResponseType } from '@/lib/api'
import { billingKeys } from './use-billing'
import { useActiveOrganization } from './use-organization'

export type ServiceAccountsResponse = InferResponseType<
  (typeof api)['service-accounts']['$get'],
  200
>
export type ServiceAccount = ServiceAccountsResponse['serviceAccounts'][number]
export type ServiceAccountExpiry = 30 | 90 | 365

const serviceAccountKeys = {
  list: (organizationId: string | undefined) =>
    ['service-accounts', organizationId ?? 'none'] as const,
}

export function useServiceAccounts() {
  const { data: activeOrganization } = useActiveOrganization()
  return useQuery({
    queryKey: serviceAccountKeys.list(activeOrganization?.id),
    queryFn: async () => handleRes<ServiceAccountsResponse>(await api['service-accounts'].$get()),
    enabled: Boolean(activeOrganization?.id),
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  const { data: activeOrganization } = useActiveOrganization()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: serviceAccountKeys.list(activeOrganization?.id) }),
      queryClient.invalidateQueries({ queryKey: billingKeys.all }),
    ])
}

export function useCreateServiceAccount() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (input: {
      name: string
      description?: string
      scopes: string[]
      expiresInDays: ServiceAccountExpiry
    }) =>
      handleRes<{ id: string; token: string; scopes: string[] }>(
        await api['service-accounts'].$post({
          json: input as Parameters<(typeof api)['service-accounts']['$post']>[0]['json'],
        })
      ),
    onSuccess: invalidate,
  })
}

export function useRotateServiceAccountToken() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (input: { id: string; expiresInDays: ServiceAccountExpiry }) =>
      handleRes<{ token: string }>(
        await api['service-accounts'][':id'].rotate.$post({
          param: { id: input.id },
          json: { expiresInDays: input.expiresInDays },
        })
      ),
    onSuccess: invalidate,
  })
}

export function useSetServiceAccountDisabled() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (input: { id: string; disabled: boolean }) =>
      handleRes<{ id: string; disabled: boolean }>(
        await api['service-accounts'][':id'].$patch({
          param: { id: input.id },
          json: { disabled: input.disabled },
        })
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteServiceAccount() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) =>
      handleRes<{ success: boolean }>(
        await api['service-accounts'][':id'].$delete({ param: { id } })
      ),
    onSuccess: invalidate,
  })
}
