export type NavMatchMode = 'default' | 'section'

export function isNavLinkActive(pathname: string, to: string, matchMode: NavMatchMode = 'default') {
  if (pathname === to) return true
  if (!pathname.startsWith(`${to}/`)) return false
  if (matchMode === 'section') return true

  const parentPath = pathname.replace(/\/[^/]+$/, '')
  const isDirectChild = parentPath === to
  return !isDirectChild
}
