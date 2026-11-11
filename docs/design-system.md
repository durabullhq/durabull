# Durabull design system — "Instrument"

Durabull is an operations console for developers. The interface should read like a well-made
instrument: calm, dense, exact. Every screen answers "what is the state, and what can I do about
it?" in as few pixels and clicks as possible.

This document is the contract for the web app (`apps/web`), the desktop shell (`apps/desktop`),
and the MCP app views (`packages/mcp/src/apps/ui`). Tokens live in `apps/web/src/styles.css`.

## Principles

1. **State first.** Lead with live numbers and status, not with a description of the page. Page
   descriptions belong in empty states, where they teach; never in the top bar.
2. **One screen, one job.** A flow that needs three places to finish (make a rule here, add its
   destination there, check it somewhere else) is a bug. Bring the pieces to the user.
3. **Fewest clicks.** Row actions are on the row. Filters are one click (metric cells and segmented
   filters, not dropdowns hiding five options). Anything reachable is reachable from ⌘K.
4. **Colour means state.** Chrome is neutral ink. Status colours are reserved for status. The
   ember accent marks brand, focus, and "you are here" — nothing else.
5. **Light and dark are equals.** Build from tokens only. Never hard-code a hex value, a
   `white`/`black` class, or a `dark:` override in a component; if a token is missing, add one.
6. **Density with air.** 13px data text, 32px controls, 36px table rows, hairline dividers. Space
   separates groups; borders separate cells.

## Tokens

| Role | Token (Tailwind class stem) | Use |
| --- | --- | --- |
| Canvas | `background` | Page background |
| Surface | `card` | Panels, tables, inputs |
| Overlay | `popover` | Menus, dialogs, palette |
| Subtle fill | `muted`, `accent` (hover) | Table headers, hover, selected |
| Text | `foreground`, `muted-foreground`, `faint` | Primary, secondary, tertiary/placeholder |
| Lines | `border`, `border-strong`, `input` | Hairlines, emphasis/hover, form controls |
| Brand | `signal` | Active nav marker, focus ring, selection |
| Status | `status-success`, `status-active`, `status-warning`, `status-danger`, `status-delayed`, `status-priority`, `status-neutral` | See below |
| Charts | `chart-1…5` | Categorical series, in order |

Status vocabulary (shared with MCP views):

| State | Token | Examples |
| --- | --- | --- |
| Healthy / done | `status-success` | completed, active queue, delivered, resolved, development |
| In flight | `status-active` | active job, running, info |
| Needs attention | `status-warning` | paused, delayed, snoozed, acknowledged, staging, stale |
| Broken | `status-danger` | failed, firing, error, production (environment tag) |
| Elevated | `status-priority` | prioritized |
| Inert | `status-neutral` | waiting, idle, disabled, unknown |

Use status colour as text/dot/hairline plus a 10% tint fill (`bg-status-danger/10`). Never a solid
status fill except the open-incident count.

Typography: Geist Sans for UI, Geist Mono for anything a machine produced (ids, queue names,
counts, timestamps, keys, code). Sizes: 13px (`text-[13px]`) body and table text, 12px (`text-xs`)
secondary, 14px (`text-sm`) semibold for titles, 20px mono for headline metrics. The `eyebrow`
utility (10px mono caps) is for table headers and group labels only.

Radius: 6px controls (`rounded-md`), 8px panels (`rounded-lg`), 12px overlays (`rounded-xl`).
Elevation: panels are flat with a hairline border — no shadow. Only overlays use `shadow-lg`.

## Layout

- **Shell.** 240px sidebar (`AppSidebar`) + 48px top bar (`AppTopBar`). The sidebar's first row is
  the same height as the top bar so their bottom edges meet.
- **Top bar.** Pages register `left` and `actions` with `useAppTopBar`. `left` is always
  `<PageTitle>` (`components/page-title.tsx`): crumbs → title → inline `meta` (status, count).
  `actions` holds at most one primary button (`size="xs"`) plus quiet secondary buttons
  (`variant="outline" size="xs"`); overflow goes in a `…` menu.
- **Page body.** `space-y-4`. Order: metric strip → toolbar (filters) → main panel. No page-level
  `h1` in the body; the top bar owns it. Detail pages use a two-column grid
  (`lg:grid-cols-[minmax(0,1fr)_320px]`) with facts in the narrow column.
- **Width.** Data pages are full width. Forms and settings cap at `max-w-3xl`.

## Components

| Need | Use | File |
| --- | --- | --- |
| Headline numbers | `MetricStrip` + `Metric` | `components/ui/metric.tsx` |
| Block heading | `SectionHeader` | `components/ui/section.tsx` |
| Bordered container | `Panel`, `PanelHeader` (or `Card`) | `components/ui/section.tsx` |
| Empty / zero / error | `EmptyState` | `components/ui/empty-state.tsx` |
| State dot | `StatusDot` | `components/status-badge.tsx` |
| Pill | `Badge` (`success`, `warning`, `destructive`, `info`, `priority`, `neutral`, `outline`) | `components/ui/badge.tsx` |
| Shortcut hint | `Kbd` | `components/ui/kbd.tsx` |
| Buttons | `Button` — `default` (one per view), `outline`, `ghost`, `destructive`; sizes `xs` 28px, `sm`/default 32px | `components/ui/button.tsx` |
| Tables | `Table*` — 36px header, mono caps headers, 13px rows | `components/ui/table.tsx` |

Rules of thumb:

- **Metrics** replace stat cards everywhere. A metric cell that maps to a filter is a button
  (`onClick`, `active`). Set `emphasis` only when the number is itself the alarm (failed > 0).
- **One primary button per view.** Destructive actions are `outline` with danger text until the
  confirm dialog, where the confirm button is `destructive`.
- **Empty states** state the fact, the reason, and the next action. One icon tile, no illustration.
- **Tables** own their toolbar: search and filters sit in a `PanelHeader` attached to the table,
  not floating above it.
- **Forms** label above control, help text below in `text-xs text-muted-foreground`, errors in
  `text-status-danger`. Group related fields in one `Panel`; never one card per field.
- **Icons** are 16px (`h-4 w-4`), 14px inside `xs` buttons. Icons accompany labels; an icon-only
  button needs `aria-label` and a tooltip.
- **Motion** is 150ms colour/opacity transitions. No entrance animation on data that polls.

## Desktop (Electron)

The desktop app runs the same UI in authless mode: there is no account, organization switcher, or
sign-out. On macOS the window uses a hidden inset title bar; the sidebar's first row is the title
bar. It reserves 78px on the left for the traffic lights and carries back/forward on the right.
Drag regions use `app-region-drag`; every interactive element inside one needs
`app-region-no-drag`. The session footer shows the version and a theme switch instead of a user.

## MCP app views

MCP views render inside an assistant host and take the host's surface colours and components
(Apps SDK UI), so they do not re-skin to Durabull's palette. What carries over is structure and
vocabulary:

- The same status-to-tone mapping as the table above (`toneOf` in
  `packages/mcp/src/apps/ui/components.tsx`): success, danger, warning, and `discovery` for
  prioritized; idle states such as waiting stay neutral. One deliberate difference: the
  production environment tag uses `discovery`, because hosts reserve danger for errors.
- The same names: Incidents (Open / Unacknowledged / Acknowledged), Alert rules, Scheduled jobs,
  Workers, Queues.
- Counts in mono tabular figures; a `Stats` row before any list, mirroring `MetricStrip`.
- One clear next action per card (`Go` for reads, `Ask` for operations the assistant performs).
