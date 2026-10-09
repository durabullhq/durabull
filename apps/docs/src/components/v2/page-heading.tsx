import type { ReactNode } from 'react'

export function PageHeading({
  label,
  title,
  children,
}: {
  label: string
  title: string
  children: ReactNode
}) {
  return (
    <header className="relative border-b border-[var(--v2-line)] pb-14 pt-32 sm:pb-16 sm:pt-40">
      <div aria-hidden className="v2-blueprint v2-blueprint-fade absolute inset-0" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <p className="v2-mono flex items-center gap-2.5 text-[var(--v2-muted)]">
          <span aria-hidden className="size-1.5 bg-[var(--v2-accent)]" />
          {label}
        </p>
        <h1 className="v2-h mt-5 text-balance text-[clamp(2.5rem,5vw,4rem)] leading-[1.05]">
          {title}
        </h1>
        <div className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--v2-muted)] sm:text-lg">
          {children}
        </div>
      </div>
    </header>
  )
}
