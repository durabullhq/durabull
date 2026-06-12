# UI Redesign — "Signal" ops-console aesthetic

Direction: confident, polished, developer-first. Dark-first graphite chrome, hairline
borders, emerald reserved as the single "signal" accent, Geist Sans + Geist Mono with
mono discipline for all data (numbers, IDs, keys, eyebrows), sharper radii, tokenized
status palette.

- [x] Design tokens: rebuild styles.css palette (light + dark), status tokens, radius, fonts, selection/focus/scrollbars
- [x] Fonts: ship Geist Sans + Geist Mono variable woff2 to public/fonts, @font-face + @theme wiring, preload in index.html
- [x] Primitives: button, badge, card, input, table, tabs, select, dialog, skeleton polish
- [x] Shell: sidebar nav (active rail indicator), top bar, eyebrow labels, logo treatment
- [x] Page headers: replace rainbow gradients with one consistent technical treatment
- [x] Status colors: tokenize status-badge, queue-table, stat cards, badge success/warning
- [x] Stragglers: nav-user gradient, theme-color meta, webmanifest
- [x] Verify: typecheck/lint/build + browser screenshots light & dark

## Review

- 46 files touched, all presentation-layer only (classNames, CSS tokens, fonts, manifest).
  No business logic, routing, or data-flow changes.
- New token system in `styles.css`: `--color-status-*` palette (success, active, warning,
  danger, delayed, priority, neutral), chart palette, `--color-signal` accent, `eyebrow`
  utility. Light + dark both rebuilt around graphite/paper neutrals.
- Geist Sans (UI) + Geist Mono (data) self-hosted in `public/fonts`, preloaded in
  `index.html`; mono + `tabular-nums` applied to all counts, IDs, keys, timestamps.
- Unified StatCard treatment everywhere: neutral card, colored hairline top accent,
  eyebrow title, mono semibold value.
- Page headers consolidated to one technical treatment (icon tile + title), rainbow
  gradients removed; nav gained an emerald "signal rail" active indicator.
- Verification: `bun run build` clean; biome format applied to touched files; browser
  screenshots verified in light and dark across dashboard, queue detail, job detail,
  workers, analytics, alerts, scheduled jobs, KV explorer, and settings.
- Pre-existing (not introduced): 4 unit test failures in `settings.test.tsx` and
  `connection-alerts-workspace.test.tsx` from incomplete `use-alerts` mocks — confirmed
  failing on baseline with changes stashed.
