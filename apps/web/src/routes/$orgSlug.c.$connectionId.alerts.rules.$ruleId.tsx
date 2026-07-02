import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  AlertRuleBuilder,
  AlertRuleBuilderSkeleton,
} from '@/components/alerts/alert-rule-builder-v2'
import { useConnection } from '@/components/connection-provider'
import { Button } from '@/components/ui/button'
import {
  useConnectionAlertRules,
  useLinearIntegration,
  useTestAlertRule,
  useUpdateAlertRule,
} from '@/hooks/use-alerts'
import { useQueues } from '@/hooks/use-queues'

export const Route = createFileRoute('/$orgSlug/c/$connectionId/alerts/rules/$ruleId')({
  component: EditAlertRuleRoute,
})

export function EditAlertRuleRoute() {
  const { orgSlug, connectionId, ruleId } = Route.useParams()
  const navigate = useNavigate()
  const { currentConnection } = useConnection()
  const rulesQuery = useConnectionAlertRules(connectionId)
  const queuesQuery = useQueues({ pageSize: 100 })
  const updateRuleMutation = useUpdateAlertRule(connectionId)
  const testRuleMutation = useTestAlertRule(connectionId)
  const linearIntegrationQuery = useLinearIntegration()
  const rule = (rulesQuery.data?.rules ?? []).find((candidate) => candidate.id === ruleId) ?? null

  if (rulesQuery.isLoading) {
    return <AlertRuleBuilderSkeleton />
  }

  if (rulesQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
        <h2 className="text-lg font-semibold">Unable to load alert rule</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Failed to load alert rules for this connection. Retry, or refresh the page.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void rulesQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    )
  }

  if (!rule) {
    return (
      <div className="rounded-lg border border-border/70 bg-background px-6 py-8">
        <h2 className="text-xl font-semibold">Alert rule not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The requested alert rule could not be loaded for this connection.
        </p>
      </div>
    )
  }

  return (
    <AlertRuleBuilder
      mode="edit"
      key={rule.id}
      orgSlug={orgSlug}
      connectionId={connectionId}
      connectionName={currentConnection?.name}
      availableQueues={(queuesQuery.data?.queues ?? []).map((queue) => queue.name)}
      rule={rule}
      isSaving={updateRuleMutation.isPending}
      isTesting={testRuleMutation.isPending}
      linearIntegrationConfigured={
        linearIntegrationQuery.data?.integration?.validationStatus === 'valid'
      }
      onSave={async (inputs) => {
        const [input] = inputs
        if (!input) {
          throw new Error('No rule changes were provided.')
        }
        await updateRuleMutation.mutateAsync({ ruleId, input })
        toast.success('Alert rule updated', {
          description: `${input.name} is now enforcing the latest policy.`,
        })

        navigate({
          to: '/$orgSlug/c/$connectionId/alerts/rules',
          params: { orgSlug, connectionId },
        })
      }}
      onTest={() =>
        testRuleMutation.mutateAsync({
          ruleId,
          deliver: (rule.notificationChannels ?? []).some((channel) => channel.type === 'webhook'),
        })
      }
    />
  )
}
