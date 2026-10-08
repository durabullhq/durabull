import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { createContext, type ReactNode, useContext, useState } from 'react'
import { AppTopBarProvider } from '@/components/app-top-bar'
import { ConnectionProvider } from '@/components/connection-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

const CatalogChildren = createContext<ReactNode>(null)
function CatalogRoute() {
  const children = useContext(CatalogChildren)
  return (
    <ConnectionProvider>
      <AppTopBarProvider>{children}</AppTopBarProvider>
    </ConnectionProvider>
  )
}

export function CatalogProvider({
  children,
  theme,
}: {
  children: ReactNode
  theme: 'light' | 'dark'
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity },
          mutations: { retry: false },
        },
      })
  )
  // A real memory router gives components real links and route params without navigating the catalog.
  const [router] = useState(() => {
    const root = createRootRoute()
    const route = createRoute({
      getParentRoute: () => root,
      path: '/$orgSlug/c/$connectionId/queues/$queueName/jobs/$jobId',
      component: CatalogRoute,
    })
    return createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({
        initialEntries: ['/acme/c/demo-redis/queues/email%3Areceipts/jobs/job-1042'],
      }),
    })
  })
  return (
    <ThemeProvider key={theme} defaultTheme={theme} storageKey={`storybook-${theme}`}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <CatalogChildren.Provider value={children}>
            <RouterProvider router={router} />
          </CatalogChildren.Provider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
