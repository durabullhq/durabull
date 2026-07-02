import { Link, useLocation } from '@tanstack/react-router'
import { Database, Info, Link2, Palette, Send, Settings, Shield, Users } from 'lucide-react'
import { useAppMode } from '@/hooks/use-app-mode'
import { cn } from '@/lib/utils'

interface SettingsLayoutProps {
  orgSlug: string
  children: React.ReactNode
}

interface SettingsNavItem {
  label: string
  to: string
  icon: React.ComponentType<{ className?: string }>
  hidden?: boolean
}

export function SettingsLayout({ orgSlug, children }: SettingsLayoutProps) {
  const { isAuthless } = useAppMode()
  const location = useLocation()
  const basePath = `/${orgSlug}/settings`

  const navItems: SettingsNavItem[] = [
    {
      label: 'Connections',
      to: `${basePath}/connections`,
      icon: Database,
    },
    {
      label: 'Authentication',
      to: `${basePath}/authentication`,
      icon: Shield,
    },
    {
      label: 'Appearance',
      to: `${basePath}/appearance`,
      icon: Palette,
    },
    {
      label: 'Integrations',
      to: `${basePath}/integrations`,
      icon: Link2,
    },
    {
      label: 'Alert destinations',
      to: `${basePath}/destinations`,
      icon: Send,
    },
    {
      label: 'Team',
      to: `${basePath}/team`,
      icon: Users,
      hidden: isAuthless,
    },
    {
      label: 'About',
      to: `${basePath}/about`,
      icon: Info,
    },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row lg:gap-6">
      <aside className="w-full shrink-0 rounded-xl border bg-card p-2 lg:w-64 lg:self-start">
        <div className="flex items-center gap-2 px-2 py-2 text-sm font-semibold text-foreground">
          <Settings className="h-4 w-4 text-muted-foreground" />
          Settings
        </div>
        <nav className="mt-1 space-y-1">
          {navItems
            .filter((item) => !item.hidden)
            .map((item) => {
              const isActive =
                location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
              const Icon = item.icon

              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    isActive && 'bg-muted font-medium text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
        </nav>
      </aside>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  )
}
