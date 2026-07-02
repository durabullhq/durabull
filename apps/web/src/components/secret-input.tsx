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
      <Input type={revealed ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
      <button
        type="button"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setRevealed((current) => !current)}
        aria-label={revealed ? 'Hide secret' : 'Show secret'}
      >
        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}
