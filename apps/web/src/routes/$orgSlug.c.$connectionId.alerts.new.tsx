import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { toast } from 'sonner'
import { z } from 'zod'
import {
  AlertRuleBuilder,
  AlertRuleBuilderSkeleton,
} from '@/components/alerts/alert-rule-builder-v2'
import { useConnection } from '@/components/connection-provider'
import {
  useConnectionAlertRules,
  useCreateAlertRule,
  useLinearIntegration,
} from '@/hooks/use-alerts'
import { useQueues } from '@/hooks/use-queues'

// `template` preselects a rule template; `from` duplicates an existing rule.
const createAlertRuleSearchSchema = z.object({
  template: z.string().optional().catch(undefined),
  from: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/$orgSlug/c/$connectionId/alerts/new')({
  validateSearch: zodValidator(createAlertRuleSearchSchema),
  component: CreateAlertRuleRoute,
})

export function CreateAlertRuleRoute() {
  const { orgSlug, connectionId } = Route.useParams()
  const { template, from } = Route.useSearch()
  const navigate = useNavigate()
  const { currentConnection } = useConnection()
  const queuesQuery = useQueues({ pageSize: 100 })
  const createRuleMutation = useCreateAlertRule(connectionId)
  const linearIntegrationQuery = useLinearIntegration()
  const rulesQuery = useConnectionAlertRules(from ? connectionId : undefined)

  if (from && rulesQuery.isLoading) {
    return <AlertRuleBuilderSkeleton />
  }

  const duplicateFrom = from
    ? ((rulesQuery.data?.rules ?? []).find((candidate) => candidate.id === from) ?? null)
    : null

  return (
    <AlertRuleBuilder
      mode="create"
      key={`create-${connectionId}-${template ?? ''}-${from ?? ''}`}
      orgSlug={orgSlug}
      connectionId={connectionId}
      connectionName={currentConnection?.name}
      availableQueues={(queuesQuery.data?.queues ?? []).map((queue) => queue.name)}
      duplicateFrom={duplicateFrom}
      initialTemplateKey={template}
      isSaving={createRuleMutation.isPending}
      linearIntegrationConfigured={
        linearIntegrationQuery.data?.integration?.validationStatus === 'valid'
      }
      onSave={async (inputs) => {
        for (const input of inputs) {
          await createRuleMutation.mutateAsync(input)
        }

        const ruleCount = inputs.length
        const primaryRuleName = inputs[0]?.name ?? 'Alert rule'

        toast.success(ruleCount === 1 ? 'Alert rule created' : 'Alert rules created', {
          description:
            ruleCount === 1
              ? `${primaryRuleName} is now being evaluated in the background.`
              : `${ruleCount} queue-scoped alert rules were created from this builder.`,
        })

        navigate({
          to: '/$orgSlug/c/$connectionId/alerts/rules',
          params: { orgSlug, connectionId },
        })
      }}
    />
  )
}
