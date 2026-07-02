import { PencilRuler } from 'lucide-react'
import { getAlertTypeMeta } from '@/components/alerts/alert-primitives'
import { ALERT_RULE_TEMPLATES, type AlertRuleTemplate } from '@/components/alerts/alert-rule-form'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface RuleTemplateCardsProps {
  linearIntegrationValid: boolean
  onSelectTemplate: (template: AlertRuleTemplate) => void
  onStartFromScratch: () => void
}

function TemplateCard({
  template,
  disabled,
  onSelect,
}: {
  template: AlertRuleTemplate
  disabled: boolean
  onSelect: () => void
}) {
  const meta = getAlertTypeMeta(template.type)
  const Icon = meta.icon

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'w-full rounded-lg border border-border/70 bg-background px-4 py-4 text-left transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-55'
          : 'hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'
      )}
      onClick={onSelect}
      data-testid={`rule-template-${template.key}`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{template.name}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{template.description}</p>
    </button>
  )
}

/** Template gallery for the create-mode builder, plus a start-from-scratch card. */
export function RuleTemplateCards({
  linearIntegrationValid,
  onSelectTemplate,
  onStartFromScratch,
}: RuleTemplateCardsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ALERT_RULE_TEMPLATES.map((template) => {
        const requiresLinear = template.key === 'linear-triage'
        const disabled = requiresLinear && !linearIntegrationValid

        if (disabled) {
          return (
            <TooltipProvider key={template.key} delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block">
                    <TemplateCard template={template} disabled onSelect={() => {}} />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Connect Linear first</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        }

        return (
          <TemplateCard
            key={template.key}
            template={template}
            disabled={false}
            onSelect={() => onSelectTemplate(template)}
          />
        )
      })}

      <button
        type="button"
        className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-4 text-left transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:col-span-2"
        onClick={onStartFromScratch}
        data-testid="rule-template-scratch"
      >
        <div className="flex items-center gap-2">
          <PencilRuler className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Start from scratch</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Build the condition, queue scope, and routing yourself with the defaults.
        </p>
      </button>
    </div>
  )
}
