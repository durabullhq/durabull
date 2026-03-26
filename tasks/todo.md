# Current Task

- [x] Remove the full-width mac desktop bar and restore the base layout.
- [x] Add a thin mac-only sidebar strip with small back/forward buttons that pushes sidebar content below the traffic lights.
- [x] Rerun lint/typecheck/tests, restart the desktop app, and confirm the updated build is served.

## Notes

- The mac desktop treatment should live inside the left navigation area only.
- The strip should be compact, around 40px tall, with small back and forward buttons.

## Result

- Replaced the full-width mac chrome with a sidebar-only `h-10` strip above the sidebar header.
- Rebuilt `apps/web/dist`, restaged the desktop runtime, and restarted the Electron app.

## Current Task

- [x] Add graceful desktop shutdown so the local Bun API closes PGlite cleanly before Electron exits.
- [x] Verify the desktop/API shutdown path with targeted lint/typecheck and a persistence sanity check.

## Result

- Added an explicit child-runtime shutdown handshake so Electron asks the local API to close PGlite before falling back to `SIGTERM` or `SIGKILL`.
- Verified the flow with a spawned Bun API process using a temp PGlite dir: saved a connection, shut down via stdin, restarted on the same dir, and confirmed the connection persisted.

## Current Task

- [x] Make the Electron desktop app identify as `Durabull` instead of `Electron` on macOS launch.
- [x] Verify the desktop package metadata/build still works after the branding fix.

## Result

- Added top-level `productName: "Durabull"` to `apps/desktop/package.json` so Electron's runtime app metadata can use the branded name during `electron .` launches, not just packaged builds.
- Revalidated the desktop package with `bun run typecheck && bun run build:main`.

## Current Task

- [x] Replace the macOS desktop dev launcher so it runs a branded app bundle instead of the stock `Electron.app`.
- [x] Verify the generated dev bundle metadata uses `Durabull` and that the desktop package still builds cleanly.

## Result

- Replaced the macOS desktop `start` flow with `apps/desktop/scripts/start.ts`, which copies Electron's runtime app bundle into `dist/dev-macos/Durabull.app`, rewrites the bundle metadata to `Durabull`, renames the executable, and launches that wrapper.
- Verified the generated `Info.plist` now reports `CFBundleDisplayName`, `CFBundleName`, and `CFBundleExecutable` as `Durabull`, and revalidated the desktop build/typecheck flow.

## Current Task

- [x] Fix the branded macOS dev launcher so the desktop runtime still resolves `dist/bin` and `dist/app-bundle`.
- [x] Revalidate the desktop build after the launcher-path fix.

## Result

- Added an explicit `DURABULL_DESKTOP_RESOURCE_ROOT` override from the macOS launcher and taught the Electron main process to honor it before falling back to packaged `process.resourcesPath`.
- Revalidated the desktop package with `bun run typecheck && bun run build`.

## Current Task

- [x] Add web unit tests covering the Electron/mac desktop chrome pieces (`use-electron-shell`, drag strip, mac sidebar controls).
- [x] Add desktop unit tests around the branded launcher/resource-root behavior that previously regressed startup.
- [x] Run the targeted web and desktop test suites plus lint/typecheck for touched files.

## Result

- Added web unit tests for Electron/mac shell detection, the top drag strip, and the mac sidebar back/forward controls, including custom history-stack behavior and native Navigation API availability.
- Extracted shared desktop launcher helpers and added Bun tests covering the mac app-bundle plist branding plus the resource-root override wiring that previously broke startup.
- Verified with `apps/web` Vitest + typecheck + lint and `apps/desktop` Bun tests + typecheck + lint.

## Current Task

- [x] Add README documentation for building and releasing the macOS desktop app.

## Result

- Expanded `apps/desktop/README.md` with explicit macOS local build, unpacked app-bundle, CI tag-release, and direct `dist:publish` instructions.
- Added a root `README.md` link to the desktop build/release guide so the release docs are easy to find.

## Current Task

- [x] Ensure CI uploads macOS desktop build artifacts to GitHub Release assets on tagged releases.

## Result

- Updated `.github/workflows/desktop-build.yml` so tag builds produce desktop artifacts locally, wait for the matching GitHub Release, and explicitly upload `apps/desktop/release/*` as release assets instead of relying on implicit `electron-builder` publish behavior.
- Aligned `apps/desktop/README.md` with the new CI release-asset upload flow.

## Current Task

- [x] Add docs coverage for desktop installation across macOS, Windows, and Homebrew.
- [x] Update the docs landing page and homepage CTAs/copy to reflect the new platform availability and direct macOS download.
- [x] Verify the docs app with targeted lint and typecheck.

## Result

- Added a dedicated `Desktop Apps` guide with direct macOS and Windows download links, the Homebrew cask command, first-launch verification steps, and release-note links.
- Updated the docs homepage, docs hub, footer, FAQ, and SEO metadata so desktop availability is now clearly represented alongside browser and self-hosted paths.
- Verified the docs app with `bun run lint`, `bun run typecheck`, and `bun run build` in `apps/docs`.

## Current Task

- [x] Audit the alerting implementation on the current branch against `PLAN-ALERTING-SYSTEM.md` and `main`, and document the real gaps.
- [x] Fix backend alerting correctness issues discovered in review, including route-safe alert URLs and stricter rule validation.
- [x] Build a production-grade alerts frontend in `apps/web` with an org-level alert center, a connection-scoped alert workspace, shared hooks/components, and navigation badging.
- [x] Add focused backend and web tests for the alerting flow and validate touched packages with lint, typecheck, and targeted test runs.

## Notes

- The current branch appears to have most backend alerting pieces but no usable web UI, so the feature is not complete until the frontend is wired into the shell.
- The web implementation should match existing Durabull dashboard patterns, not a bolt-on admin screen.

## Result

- Audited `PLAN-ALERTING-SYSTEM.md` against the working tree and confirmed phases 1-6 were mostly present while the frontend was entirely absent, leaving the feature unusable end to end.
- Fixed backend correctness gaps by validating merged rule updates on PATCH, correcting alert email links to the real org-scoped app routes, and adding focused alert evaluator/notifier tests.
- Added a complete alerts experience in `apps/web`: typed alert hooks, org-level alert center, connection-scoped alert workspace with rule CRUD/test/mute/delete flows, shared event/rule UI, sidebar alerts navigation with live badging, and route tree generation for the new pages.
- Validated with `@durabull/web` typecheck, build, and focused unit tests plus `@durabull/api` typecheck, lint, and focused Bun tests. Web lint still reports one unrelated pre-existing warning in `apps/web/src/routes/$orgSlug.c.$connectionId.queues.$queueName.tsx`.

## Current Task

- [x] Replace the alert-rule dialog flow with a dedicated full-page rule builder.
- [x] Redesign the rule authoring UX to be flatter, clearer, and more developer-oriented.
- [x] Add searchable queue multi-select behavior and richer notification routing UX with disabled `coming soon` options.
- [x] Revalidate the web package after the authoring-flow redesign.

## Result

- Replaced the modal-based alert authoring flow with dedicated `alerts/new` and `alerts/$ruleId` pages backed by a shared full-page builder.
- Redesigned the builder into a flatter, more developer-oriented workflow with step-based sections, selected rule-type toggles, queue search + multi-select, clearer inline guidance, and a right-rail summary/tips panel.
- Added multi-queue create behavior that generates one queue-scoped rule per selected queue, plus richer notification routing rows for multiple email destinations and disabled `Slack` / `Linear` placeholders tagged as coming soon.
- Revalidated with `@durabull/web` typecheck, unit tests, build, and lint. The only remaining web lint warning is the same unrelated pre-existing warning in `apps/web/src/routes/$orgSlug.c.$connectionId.queues.$queueName.tsx`.

## Current Task

- [x] Add substantial backend alerting tests covering evaluator edge cases, monitor lifecycle behavior, and alert API route integration.
- [x] Add substantial frontend alerting tests covering form helpers, hooks, components, and route-level orchestration.
- [x] Revalidate the touched alerting suites with targeted and package-level test/lint/typecheck runs.

## Result

- Added deep backend alerting coverage: evaluator edge cases, notifier URL encoding, monitor state-machine behavior, connection-scoped alert route integration, and org-level alert summary/history integration.
- Added deep frontend alerting coverage: rule-form validation/serialization helpers, alert query/mutation hooks, queue multi-select interactions, alert events table rendering, builder-page flows, workspace rule/history actions, and `alerts/new` / `alerts/$ruleId` route orchestration.
- Verified with `apps/api` full `bun test`, `bun run typecheck`, and `bun run lint`, plus `apps/web` full `bun run test:unit`, `bun run typecheck`, and `bun run lint`.
- `apps/web` lint still reports the same pre-existing unrelated warning in `apps/web/src/routes/$orgSlug.c.$connectionId.queues.$queueName.tsx`.
