import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type SecretInputProps = Omit<React.ComponentProps<typeof Input>, 'type'>

/** Password-style input with an Eye/EyeOff visibility toggle inside the field. */
export function SecretInput({ className, ...props }: SecretInputProps) {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="relative">
      <Input type={revealed ? 'text' : 'password'} className={cn('pr-8', className)} {...props} />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
        onClick={() => setRevealed((current) => !current)}
        aria-label={revealed ? 'Hide secret' : 'Show secret'}
        aria-pressed={revealed}
      >
        {revealed ? (
          <EyeOff className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Eye className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
    </div>
  )
}
