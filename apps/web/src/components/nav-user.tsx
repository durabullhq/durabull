import { AnalyticsEvents, trackEvent } from '@durabull/analytics'
import { useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
import { useAppMode } from '@/hooks/use-app-mode'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

interface NavUserProps {
  user: {
    name: string
    email: string
    avatar: string
  }
}

/**
 * User avatar dropdown in the navigation sidebar
 * Provides access to settings, theme toggle, and logout
 */
export function NavUser({ user }: NavUserProps) {
  const { theme, setTheme } = useTheme()
  const { signOut } = useAuth()
  const { isAuthless } = useAppMode()
  const navigate = useNavigate()

  const handleLogout = async () => {
    if (isAuthless) return
    trackEvent(AnalyticsEvents.USER_SIGNED_OUT, {})
    await signOut()
    navigate({ to: '/login', replace: true })
  }

  // Generate initials from name
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')

  const avatarFallbackClassName = cn(
    'rounded-md text-white',
    isAuthless
      ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
      : 'bg-gradient-to-br from-indigo-500 to-purple-600'
  )

  const subtitle = isAuthless ? 'Local development mode' : user.email

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="user-menu"
        className="w-full rounded-lg outline-none ring-ring hover:bg-sidebar-accent focus-visible:ring-2 data-[state=open]:bg-sidebar-accent"
      >
        <div className="flex items-center gap-2 px-2 py-2 text-left text-sm transition-all">
          <Avatar className="h-7 w-7 rounded-md border">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback className={avatarFallbackClassName}>
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 leading-tight text-left">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-sidebar-foreground">{user.name}</span>
              {isAuthless && (
                <span className="shrink-0 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-100/90">
                  Local
                </span>
              )}
            </div>
            <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" side="top" sideOffset={4}>
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-2 py-2 text-left text-sm">
            <Avatar className="h-7 w-7 rounded-md">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className={avatarFallbackClassName}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 leading-tight">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{user.name}</span>
                {isAuthless && (
                  <Badge className="border-emerald-400/15 bg-emerald-400/10 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200 shadow-none">
                    Authless
                  </Badge>
                )}
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {isAuthless ? user.email : subtitle}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => navigate({ to: '/settings' })}
          >
            <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
            Settings
          </DropdownMenuItem>
          <ThemeSubmenu theme={theme} setTheme={setTheme} />
        </DropdownMenuGroup>
        {isAuthless ? (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-2 text-xs leading-relaxed text-muted-foreground">
              Running with a local authless session. Sign-out is unavailable in this mode.
            </div>
          </>
        ) : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="sign-out"
              className="cursor-pointer text-destructive focus:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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
      <DropdownMenuSubTrigger className="cursor-pointer">
        <ThemeIcon className="mr-2 h-4 w-4 text-muted-foreground" />
        Theme
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem onClick={() => handleThemeChange('light')} className="cursor-pointer">
          <Sun className="mr-2 h-4 w-4" />
          Light
          {theme === 'light' && <span className="ml-auto text-xs text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange('dark')} className="cursor-pointer">
          <Moon className="mr-2 h-4 w-4" />
          Dark
          {theme === 'dark' && <span className="ml-auto text-xs text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange('system')} className="cursor-pointer">
          <Monitor className="mr-2 h-4 w-4" />
          System
          {theme === 'system' && <span className="ml-auto text-xs text-primary">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
