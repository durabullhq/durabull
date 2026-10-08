# Durabull UI catalog

A standalone Storybook workspace that renders the production UI with invented data. It includes primitives, web components and screens, Electron controls, marketing sections and pages, email templates, and the embedded MCP app.

```sh
# From the repository root
bun install --frozen-lockfile
bun run storybook
bun run build:storybook

# Package checks
bun run --cwd apps/storybook typecheck
bun run --cwd apps/storybook test
bun run --cwd apps/storybook test:browser
# After building the marketing export
bun run build:docs
bun run --cwd apps/storybook test:hosting
```

Development opens at `http://localhost:6006`. `build:storybook` writes a complete static site to `apps/storybook/dist`. `bun run --cwd apps/storybook preview` serves that build. Browser verification requires the build first and Playwright Chromium (`bunx playwright install chromium`).

## Public hosting

Upload **the contents of `dist`** to any static host. No API server, database, Redis, credentials, environment variables, or runtime Node process is needed. Keep all generated files, including `mockServiceWorker.js`, together. Serve over HTTPS (or localhost) so the fixture service worker can start. `index.html` serves the manager; `iframe.html` serves previews. Avoid an SPA fallback that replaces worker or asset requests with HTML.

The marketing static build (`bun run build:docs`, or `bun run build` inside `apps/docs`) includes the complete catalog at **`/ui/`** in `apps/docs/out/ui`. It also publishes dashboard fonts at `/fonts`; marketing screenshots and videos already exist at their production paths. This is the default deployment on Render: keep the marketing service's build command and `apps/docs/out` publish directory. No additional service, domain, or proxy is required. Preserve directory-index handling so `/ui` redirects to `/ui/` before loading the manager's relative assets.

For a standalone Vercel deployment, select `apps/storybook` as the Root Directory and enable access to files outside that directory. The included `vercel.json` builds the monorepo workspace and publishes `dist`. For other standalone hosts, use `bun run build:storybook` from the repo root with `apps/storybook/dist` as the publish directory. Serve standalone builds at the domain root so the existing product assets retain their URLs.

The fixture worker is loaded relative to `iframe.html`, so at `/ui/` its default scope is **`/ui/`**. It intercepts requests from catalog previews without controlling the marketing pages or documentation. `bun run --cwd apps/docs start` uses the shared serving configuration to preserve Storybook's `.html` URLs and their query strings while retaining marketing's existing clean URLs.

The build disables source maps and telemetry. API traffic is handled by local MSW fixtures; unrecognized API endpoints fail visibly. Auth and analytics are replaced only in the Storybook bundle. MCP previews use a sandboxed iframe and the real `AppBridge`, with schema-validated tool fixtures. Assistant requests are recorded under Host activity. Email links use `example.com`.

## Organization and authoring

- **Foundations:** primitives, typography/color tokens, overlays, tables, charts.
- **Web Components:** queues, jobs, payload editors, retry flow, alerts, settings, observability.
- **Web Screens:** real route tree and application shell in a memory router.
- **Desktop:** Electron title-bar and macOS navigation controls.
- **Marketing:** production pages, landing sections, and brand/navigation components.
- **Email:** production invitation and incident templates in isolated documents.
- **MCP Apps:** production app views, error/empty/connecting states, dark and compact layouts.

Stories live in `src/stories` and import production components directly. Fixtures live in `src/fixtures`; add invented data there, never copy customer data or load `.env`. Use `satisfies Meta<typeof Component>` and `StoryObj<typeof meta>` for typed args. Add meaningful variants and keep controlled inputs interactive. The global toolbar switches web themes; MCP previews additionally expose the host theme as a control.

`bun run test` checks component modules, route screens, and MCP view coverage. Infrastructure-only providers and telemetry injections have explicit exclusions in `scripts/check-coverage.ts`; new UI files fail the check until they have stories. `test:browser` renders every indexed story and checks for render errors, missing fixtures, and MCP bridge failures, then exercises MCP job navigation and the assistant handoff.

The existing docs/public and web/public assets are reused. Framework adapters for Next Link/Image preserve ordinary links and image rendering without starting Next.js; framework internals and telemetry are intentionally outside the visual catalog. Remote company favicons are represented by local monograms to keep previews self-contained.
