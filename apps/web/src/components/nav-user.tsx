import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents } from '@durabull/analytics/events'
import { useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react'
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
    .split(' ')
    .map((n) => n[0])
    .join('')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="user-menu"
        className="w-full rounded-lg outline-none ring-ring hover:bg-sidebar-accent focus-visible:ring-2 data-[state=open]:bg-sidebar-accent"
      >
        <div className="flex items-center gap-2 px-2 py-2 text-left text-sm transition-all">
          <Avatar className="h-7 w-7 rounded-md border">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback className="rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 leading-tight text-left">
            <span className="truncate font-medium text-sidebar-foreground">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" side="top" sideOffset={4}>
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-2 py-2 text-left text-sm">
            <Avatar className="h-7 w-7 rounded-md">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => navigate({ to: settingsPath })}
          >
            <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
            Settings
          </DropdownMenuItem>
          <ThemeSubmenu theme={theme} setTheme={setTheme} />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="sign-out"
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
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
