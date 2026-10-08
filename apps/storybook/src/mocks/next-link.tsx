import type { ComponentProps } from 'react'
export default function Link({
  href,
  prefetch: _prefetch,
  ...props
}: Omit<ComponentProps<'a'>, 'href'> & { href: string; prefetch?: boolean }) {
  return <a href={href} {...props} />
}
