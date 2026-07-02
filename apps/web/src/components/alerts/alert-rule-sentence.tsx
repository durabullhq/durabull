import type { SentenceToken } from '@/components/alerts/alert-rule-form'
import { cn } from '@/lib/utils'

interface AlertRuleSentenceProps {
  tokens: SentenceToken[]
  /** Called before the default scroll/focus, e.g. to open a collapsed panel. */
  onTokenClick?: (token: SentenceToken) => void
}

function focusPanel(targetId: string) {
  const element = document.getElementById(targetId)
  if (!element) return
  element.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  element.focus?.({ preventScroll: true })
}

function TokenButton({
  token,
  onTokenClick,
}: {
  token: SentenceToken
  onTokenClick?: (token: SentenceToken) => void
}) {
  return (
    <button
      type="button"
      data-testid={`sentence-token-${token.key}`}
      className={cn(
        'mx-0.5 inline-block max-w-full truncate align-baseline transition-colors',
        token.set
          ? 'rounded-md bg-muted/60 px-1.5 py-0.5 font-medium text-foreground hover:bg-muted'
          : 'rounded-md border border-dashed border-border px-1.5 py-0.5 italic text-muted-foreground hover:text-foreground',
        token.invalid && 'bg-destructive/10 text-destructive hover:bg-destructive/15'
      )}
      onClick={() => {
        onTokenClick?.(token)
        requestAnimationFrame(() => focusPanel(token.targetId))
      }}
    >
      {token.set ? token.label : `[${token.label}]`}
    </button>
  )
}

/**
 * Live sentence preview of the alert rule draft: "When [queues] records
 * [condition], notify [routes] — [cooldown]." Each token scrolls to and
 * focuses its builder panel.
 */
export function AlertRuleSentence({ tokens, onTokenClick }: AlertRuleSentenceProps) {
  const byKey = (key: SentenceToken['key']) => tokens.find((token) => token.key === key)
  const queues = byKey('queues')
  const condition = byKey('condition')
  const routes = byKey('routes')
  const cooldown = byKey('cooldown')

  return (
    <p
      className="min-w-0 text-sm leading-7 text-muted-foreground"
      data-testid="alert-rule-sentence"
    >
      When {queues ? <TokenButton token={queues} onTokenClick={onTokenClick} /> : null} records{' '}
      {condition ? <TokenButton token={condition} onTokenClick={onTokenClick} /> : null}, notify{' '}
      {routes ? <TokenButton token={routes} onTokenClick={onTokenClick} /> : null} —{' '}
      {cooldown ? <TokenButton token={cooldown} onTokenClick={onTokenClick} /> : null}.
    </p>
  )
}
