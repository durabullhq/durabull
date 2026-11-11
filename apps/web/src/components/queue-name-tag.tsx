import { Link, useParams } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { useConnection } from './connection-provider'

interface QueueNameTagProps {
  name: string
  /** Render as a link to the queue detail page */
  asLink?: boolean
  /** Additional class names */
  className?: string
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
}

const sizeStyles = {
  sm: 'px-1.5 py-px text-xs leading-[18px]',
  md: 'px-2 py-0.5 text-[13px] leading-5',
  lg: 'px-2.5 py-1 text-sm',
}

/**
 * The one way a queue name is shown outside a table's own name column: a quiet
 * mono chip, so machine identifiers read as identifiers.
 */
export function QueueNameTag({ name, asLink = false, className, size = 'md' }: QueueNameTagProps) {
  const { currentConnection } = useConnection()
  const connectionId = currentConnection?.id
  // Get orgSlug from route params for org-scoped navigation
  const params = useParams({ strict: false })
  const orgSlug = (params as { orgSlug?: string }).orgSlug

  const baseStyles = cn(
    'inline-flex max-w-full items-center rounded-[5px] border bg-muted/50 font-mono font-medium text-foreground transition-colors duration-150',
    sizeStyles[size],
    className
  )

  if (asLink && connectionId && orgSlug) {
    return (
      <Link
        to="/$orgSlug/c/$connectionId/queues/$queueName"
        params={{ orgSlug, connectionId, queueName: name }}
        search={{}}
        title={name}
        className={cn(
          baseStyles,
          'hover:border-border-strong hover:bg-accent hover:text-accent-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
        )}
      >
        <span className="truncate">{name}</span>
      </Link>
    )
  }

  return (
    <span className={baseStyles} title={name}>
      <span className="truncate">{name}</span>
    </span>
  )
}
