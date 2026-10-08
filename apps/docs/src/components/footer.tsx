import { Github, Twitter } from 'lucide-react'
import Link from 'next/link'
import { DurabullLogo, DurabullWordmark } from '@/components/durabull-logo'

const footerLinks = {
  product: [
    { label: 'Product Tour', href: '/#product' },
    { label: 'Capabilities', href: '/#features' },
    { label: 'FAQ', href: '/#faq' },
  ],
  resources: [
    { label: 'Documentation', href: '/documentation' },
    { label: 'Desktop Apps', href: '/documentation/getting-started/desktop-apps' },
    { label: 'HTTP API', href: '/documentation/reference/http-api' },
    { label: 'Deployment Guide', href: '/documentation/deployment/docker' },
  ],
  company: [
    { label: 'Contact', href: 'mailto:hello@durabull.io' },
    { label: 'Status', href: 'https://x.com/durabullhq' },
  ],
}

function FooterLink({ href, label }: { href: string; label: string }) {
  if (href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:')) {
    return (
      <a
        href={href}
        className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
      >
        {label}
      </a>
    )
  }
  return (
    <Link
      href={href}
      className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
    >
      {label}
    </Link>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <DurabullLogo className="h-8 w-8 text-emerald-500" />
              <DurabullWordmark className="h-5 text-foreground" />
            </Link>
            <p className="text-muted-foreground text-sm max-w-xs mb-6">
              The modern BullMQ dashboard for browser, desktop, and self-hosted teams. Built for
              developers who demand reliability at every stage of queue operations.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/durabullhq/durabull"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Durabull on GitHub"
                title="Durabull GitHub repository"
                className="rounded-lg bg-secondary p-2 transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Github className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </a>
              <a
                href="https://x.com/durabullhq"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Durabull on X"
                className="rounded-lg bg-secondary p-2 transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Twitter className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold mb-4">Product</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <FooterLink href={link.href} label={link.label} />
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-semibold mb-4">Resources</h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <FooterLink href={link.href} label={link.label} />
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold mb-4">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <FooterLink href={link.href} label={link.label} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-16 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Durabull. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="status-dot active" />
              BullMQ operations
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
