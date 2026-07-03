/**
 * A nav link is active on an exact match of `to`, or anywhere within its
 * section. `matchPath` overrides the section prefix for links whose `to`
 * differs from the section they own (e.g. Queues links to the connection
 * root but owns the `/queues` subtree).
 */
export function isNavLinkActive(pathname: string, to: string, matchPath: string = to) {
  return pathname === to || pathname === matchPath || pathname.startsWith(`${matchPath}/`)
}
