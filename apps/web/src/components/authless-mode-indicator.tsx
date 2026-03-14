import { Badge } from '@/components/ui/badge'

/**
 * Sidebar runtime badge for authless mode.
 * Replaces the org switcher where multi-org behavior is unavailable.
 */
export function AuthlessModeIndicator() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/15 bg-linear-to-r from-emerald-500/10 via-emerald-500/4 to-transparent px-3 py-2.5">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-emerald-400/35" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-100/65">
            Runtime
          </span>
        </div>
        <div className="truncate text-sm font-medium text-sidebar-foreground">Local development</div>
      </div>
      <Badge className="shrink-0 border-emerald-400/20 bg-emerald-400/10 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100 shadow-none">
        Authless
      </Badge>
    </div>
  )
}
