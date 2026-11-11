import { PencilRuler } from 'lucide-react'
import type { ComponentPropsWithRef } from 'react'
import { getAlertTypeMeta } from '@/components/alerts/alert-primitives'
import { ALERT_RULE_TEMPLATES, type AlertRuleTemplate } from '@/components/alerts/alert-rule-form'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface RuleTemplateCardsProps {
  /** `cards` teach (empty states); `chips` stay out of the way (the rule editor). */
  variant?: 'cards' | 'chips'
  linearIntegrationValid: boolean
  onSelectTemplate: (template: AlertRuleTemplate) => void
  onStartFromScratch: () => void
}

function TemplateCard({
  template,
  disabled,
  onSelect,
  variant = 'cards',
  ...triggerProps
}: {
  template: AlertRuleTemplate
  disabled: boolean
  onSelect: () => void
  variant?: 'cards' | 'chips'
} & ComponentPropsWithRef<'button'>) {
  const meta = getAlertTypeMeta(template.type)
  const Icon = meta.icon

  if (variant === 'chips') {
    return (
      <button
        {...triggerProps}
        type="button"
        aria-disabled={disabled}
        title={disabled ? undefined : template.description}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-[13px] font-medium transition-colors',
          disabled
            ? 'cursor-not-allowed opacity-55'
            : 'hover:border-border-strong hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
        )}
        onClick={disabled ? undefined : onSelect}
        data-testid={`rule-template-${template.key}`}
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {template.name}
      </button>
    )
  }

  return (
    <button
      // Forwards TooltipTrigger's cloned props (ref, hover/focus handlers)
      // when this card is used as the disabled-state tooltip trigger.
      {...triggerProps}
      type="button"
      // aria-disabled keeps the button focusable so the disabled-state tooltip
      // stays reachable by keyboard (an HTML-disabled button never focuses).
      aria-disabled={disabled}
      className={cn(
        'w-full rounded-lg border bg-card px-3.5 py-3 text-left transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-55'
          : 'hover:border-border-strong hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
      )}
      onClick={disabled ? undefined : onSelect}
      data-testid={`rule-template-${template.key}`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-[13px] font-semibold">{template.name}</span>
      </div>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{template.description}</p>
    </button>
  )
}

/** Template gallery for the create-mode builder, plus a start-from-scratch card. */
export function RuleTemplateCards({
  variant = 'cards',
  linearIntegrationValid,
  onSelectTemplate,
  onStartFromScratch,
}: RuleTemplateCardsProps) {
  return (
    <div
      className={
        variant === 'chips'
          ? 'flex flex-wrap gap-1.5'
          : 'grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3'
      }
    >
      {ALERT_RULE_TEMPLATES.map((template) => {
        const requiresLinear = template.key === 'linear-triage'
        const disabled = requiresLinear && !linearIntegrationValid

        if (disabled) {
          return (
            <TooltipProvider key={template.key} delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TemplateCard
                    template={template}
                    disabled
                    variant={variant}
                    onSelect={() => {}}
                  />
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
            variant={variant}
            onSelect={() => onSelectTemplate(template)}
          />
        )
      })}

      {variant === 'chips' ? (
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border-strong px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={onStartFromScratch}
          data-testid="rule-template-scratch"
        >
          <PencilRuler className="h-3.5 w-3.5" />
          Start from scratch
        </button>
      ) : (
        <button
          type="button"
          className="rounded-lg border border-dashed border-border-strong px-3.5 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={onStartFromScratch}
          data-testid="rule-template-scratch"
        >
          <div className="flex items-center gap-2">
            <PencilRuler className="h-4 w-4 text-muted-foreground" />
            <span className="text-[13px] font-semibold">Start from scratch</span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            Build the condition, queue scope, and routing yourself with the defaults.
          </p>
        </button>
      )}
    </div>
  )
}
