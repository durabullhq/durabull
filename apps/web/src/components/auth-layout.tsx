import { AlertCircle, Github, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { DurabullLogo, DurabullWordmark } from '@/components/durabull-logo'
import { ElectronTitleBarDragStrip } from '@/components/electron-title-bar-drag-strip'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Panel } from '@/components/ui/section'
import { cn } from '@/lib/utils'

interface AuthLayoutProps {
  children: ReactNode
  /** Muted line under the card: the alternate route, account switch, fine print. */
  footer?: ReactNode
  /** 400px column by default; `wide` (480px) for screens that list things, like consent. */
  width?: 'default' | 'wide'
}

/**
 * The one look for every signed-out and pre-workspace screen (login, signup,
 * invite, consent, auth errors, organization setup): brand above a single
 * hairline card, centred on the canvas over the blueprint grid.
 *
 * Follows the app theme, and carries the Electron drag strip so the desktop
 * window can still be moved while no app chrome is on screen.
 */
export function AuthLayout({ children, footer, width = 'default' }: AuthLayoutProps) {
  return (
    <div className="relative isolate flex min-h-screen flex-col bg-background text-foreground">
      <div
        className="bg-grid mask-radial-fade pointer-events-none absolute inset-0 -z-10"
        aria-hidden
      />
      <ElectronTitleBarDragStrip />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className={cn('w-full', width === 'wide' ? 'max-w-[480px]' : 'max-w-[400px]')}>
          <div className="mb-6 flex items-center justify-center gap-2">
            <DurabullLogo className="h-7 w-7" />
            <DurabullWordmark className="h-[18px]" />
          </div>
          <Panel className="rounded-xl p-6">{children}</Panel>
          {footer ? (
            <div className="mt-4 text-center text-[13px] leading-5 text-muted-foreground">
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}

/** Full-screen wait state for auth screens: a small spinner, never a blank page. */
export function AuthLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <ElectronTitleBarDragStrip />
      <div className="flex flex-1 flex-col items-center justify-center gap-3" aria-live="polite">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-[13px] text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

/** Card heading: what this screen is for, and one line of context when there is any. */
export function AuthHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-base font-semibold tracking-tight">{title}</h1>
      {description ? (
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

/** Label above control, optional help text below. */
export function AuthField({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[13px]">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs leading-4 text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** Inline form error. Plain danger text: the message is the signal, not a box. */
export function AuthError({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="alert"
      className={cn('flex items-start gap-2 text-[13px] leading-5 text-status-danger', className)}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  )
}

/** Hairline "or" between single sign-on and the email form. */
export function AuthDivider({ className }: { className?: string }) {
  return (
    <div className={cn('my-5 flex items-center gap-3', className)} aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] leading-none text-faint">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/** Footer and inline text links on auth screens. */
export const authLinkClassName =
  'rounded-sm font-medium text-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

/** Footer for screens that need a session: who is signed in, and the way out. */
export function AuthAccountFooter({
  email,
  onSignOut,
}: {
  email: string | null | undefined
  onSignOut: () => void
}) {
  return (
    <>
      {email ? (
        <span className="block truncate">
          Signed in as <span className="text-foreground">{email}</span>
        </span>
      ) : null}
      <button type="button" className={authLinkClassName} onClick={onSignOut}>
        Sign out and use a different account
      </button>
    </>
  )
}

export type SocialAuthProvider = 'google' | 'github'

/** The two single sign-on choices, stacked as equal outline buttons. */
export function SocialAuthButtons({
  onSelect,
  disabled = false,
  loadingProvider = null,
}: {
  onSelect: (provider: SocialAuthProvider) => void
  disabled?: boolean
  loadingProvider?: SocialAuthProvider | null
}) {
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="h-9 w-full"
        onClick={() => onSelect('google')}
        disabled={disabled}
      >
        {loadingProvider === 'google' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <GoogleIcon className="h-4 w-4" />
        )}
        Continue with Google
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-9 w-full"
        onClick={() => onSelect('github')}
        disabled={disabled}
      >
        {loadingProvider === 'github' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Github className="h-4 w-4" aria-hidden />
        )}
        Continue with GitHub
      </Button>
    </div>
  )
}

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}
