import type { Meta, StoryObj } from '@storybook/react-vite'
import { DurabullLogo } from '@/components/durabull-logo'

const meta = { title: 'Start Here/Welcome', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta
export const Overview: StoryObj<typeof meta> = {
  render: () => (
    <main className="catalog-intro">
      <DurabullLogo className="size-14 mb-8" />
      <div className="catalog-eyebrow mb-4">Durabull / Interface library</div>
      <h1>
        Every surface.
        <br />
        One place to explore.
      </h1>
      <p className="my-6">
        The production interface for queue operations, from the smallest control to the full
        workspace and embedded MCP apps. All data is invented and actions are simulated locally.
      </p>
      <div className="catalog-grid mt-10">
        {[
          ['Foundations', 'Colors, controls, overlays, tables, and charts.'],
          ['Web Components', 'Jobs, queues, alerts, analytics, and workspace settings.'],
          ['Web Screens', 'Complete screens with the real application shell and memory routing.'],
          ['Desktop', 'Electron title bar and macOS window controls.'],
          ['Marketing & Email', 'Landing sections, brand assets, and email notifications.'],
          ['MCP Apps', 'The real embedded app running through a local MCP host bridge.'],
        ].map(([title, description]) => (
          <section key={title} className="catalog-panel">
            <h2>{title}</h2>
            <p>{description}</p>
          </section>
        ))}
      </div>
      <p className="mt-8">
        Use the theme and viewport toolbar to inspect each surface. The Controls panel exposes
        component props; the Docs tab collects usage and variants.
      </p>
    </main>
  ),
}
