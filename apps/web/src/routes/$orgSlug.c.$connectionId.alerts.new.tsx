import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { AlertRuleBuilderPage } from '@/components/alerts/alert-rule-builder-page'
import { useConnection } from '@/components/connection-provider'
import { useCreateAlertRule } from '@/hooks/use-alerts'
import { useQueues } from '@/hooks/use-queues'

export const Route = createFileRoute('/$orgSlug/c/$connectionId/alerts/new')({
  component: CreateAlertRuleRoute,
})

export function CreateAlertRuleRoute() {
  const { orgSlug, connectionId } = Route.useParams()
  const navigate = useNavigate()
  const { currentConnection } = useConnection()
  const queuesQuery = useQueues()
  const createRuleMutation = useCreateAlertRule(connectionId)

  return (
    <AlertRuleBuilderPage
      mode="create"
      orgSlug={orgSlug}
      connectionId={connectionId}
      connectionName={currentConnection?.name}
      availableQueues={(queuesQuery.data?.queues ?? []).map((queue) => queue.name)}
      isSaving={createRuleMutation.isPending}
      onSave={async (input) => {
        await createRuleMutation.mutateAsync(input)

        toast.success('Alert rule created', {
          description: `${input.name} is now being evaluated in the background.`,
        })

        navigate({
          to: '/$orgSlug/c/$connectionId/alerts',
          params: { orgSlug, connectionId },
          search: { tab: 'rules' },
        })
      }}
    />
  )
}
