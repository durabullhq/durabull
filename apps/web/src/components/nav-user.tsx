import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronsUpDown, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/use-auth'

interface NavUserProps {
  user: {
    name: string
    email: string
    avatar: string
  }
  settingsPath?: string
}

/**
 * User avatar dropdown in the navigation sidebar
 * Provides access to settings, theme toggle, and logout
 */
export function NavUser({ user, settingsPath = '/settings' }: NavUserProps) {
  const { theme, setTheme } = useTheme()
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    trackEvent(AnalyticsEvents.USER_SIGNED_OUT, {})
    await signOut()
    navigate({ to: '/login', replace: true })
  }

  // Generate initials from name
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="user-menu"
        className="group flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-sidebar-accent"
      >
        <Avatar className="h-6 w-6 rounded-md border">
          <AvatarImage src={user.avatar} alt="" />
          <AvatarFallback className="rounded-md bg-muted font-mono text-[10px] font-medium text-muted-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-[13px] font-medium leading-4 text-sidebar-accent-foreground">
            {user.name}
          </span>
          {user.email ? (
            <span className="truncate text-[11px] leading-[13px] text-muted-foreground">
              {user.email}
            </span>
          ) : null}
        </span>
        <ChevronsUpDown
          className="h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-muted-foreground"
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start" side="top" sideOffset={6}>
        {user.email ? (
          <>
            <DropdownMenuLabel className="truncate font-normal" title={user.email}>
              {user.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => navigate({ to: settingsPath })}>
            <Settings className="text-muted-foreground" aria-hidden />
            Settings
          </DropdownMenuItem>
          <ThemeSubmenu theme={theme} setTheme={setTheme} />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="sign-out"
          className="text-status-danger focus:bg-status-danger/10 focus:text-status-danger"
          onClick={handleLogout}
        >
          <LogOut aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

/**
 * Theme selection submenu component
 * Extracted to reduce complexity in NavUser
 */
function ThemeSubmenu({
  theme,
  setTheme,
}: {
  theme: string
  setTheme: (theme: 'light' | 'dark' | 'system') => void
}) {
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    trackEvent(AnalyticsEvents.THEME_CHANGED, { theme: newTheme })
    setTheme(newTheme)
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ThemeIcon className="text-muted-foreground" aria-hidden />
        Theme
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onClick={() => handleThemeChange(value)}>
            <Icon className="text-muted-foreground" aria-hidden />
            {label}
            {theme === value ? <Check className="ml-auto text-foreground" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
