# Desktop Builds

Durabull's Electron app is a thin native shell around the existing production web and Bun API builds.

The packaged desktop app uses the same production telemetry policy as self-hosted Durabull:
anonymous/pseudonymous usage telemetry is collected to understand feature usage and improve the
product. Durabull does not collect Redis URLs, queue names, Redis key names, job data, logs, emails,
names, organizations, or raw error messages.

## Installing on macOS

Use the [desktop installation guide](https://durabull.io/documentation/getting-started/desktop-apps)
for downloads and SHA-256 verification. Verify the DMG and checksum from the same release before
opening the app or changing quarantine settings.

Durabull is distributed outside the Mac App Store and is not signed with an Apple Developer ID certificate. macOS will block the app on first launch with a "cannot be verified" warning.

After mounting the `.dmg` and dragging Durabull to Applications, run this once in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Durabull.app
```

Then open Durabull normally. The command removes the quarantine attribute on the app bundle. Use it only for a download you have verified and trust.

**Alternative (no Terminal required):**

1. Try to open Durabull — macOS will block it.
2. Open **System Settings → Privacy & Security**.
3. Scroll down to find *"Durabull" was blocked* and click **Open Anyway**.
4. Confirm the dialog that follows.

### Homebrew

```bash
brew install --cask durabullhq/tap/durabull
```

> Homebrew strips the quarantine flag automatically during install — no extra steps needed.

## Why this structure

- The current API server is Bun-native, so the desktop app ships a bundled Bun runtime and starts the already-built API locally.
- The API keeps serving the existing Vite build over `http://127.0.0.1:<port>`, which preserves the current routing, auth, cookies, and `/api` behavior.
- Local-first defaults are applied only inside the desktop shell:
  - `DURABULL_AUTHLESS=true`
  - `DURABULL_ENV_CONNECTIONS=false`
  - persistent `DURABULL_PGLITE_DIR` under Electron `userData`
  - a stable local secret for encrypted saved Redis connection URLs

## Commands

From the repo root:

```bash
bun run build:desktop
bun run start:desktop
bun run dist:desktop
```

Artifacts are emitted from `apps/desktop/release/`.

## macOS build and release

### Build a local mac app

From the repo root on macOS:

```bash
bun run build:desktop
bun run dist:desktop
```

This produces the packaged desktop artifacts in `apps/desktop/release/`, including the macOS `.dmg` and `.zip` targets configured in `apps/desktop/electron-builder.config.cjs`.

If you only want the unpacked app bundle for a quick local sanity check, run:

```bash
bun run dist:desktop:dir
```

### Release the mac app

- Tagged releases are built in GitHub Actions by `.github/workflows/desktop-build.yml`.
- Pushing a tag like `v1.2.3` runs `bun run dist:desktop`, which uses Turborepo to build the desktop app plus its dependent `@durabull/api` and `@durabull/web` workspaces before uploading the generated desktop artifacts from `apps/desktop/release/` to the matching GitHub Release assets in CI.
- Manual `workflow_dispatch` runs build an unpacked app bundle with `dist:desktop:dir` and do not publish a GitHub Release. The current artifact upload patterns target installer files, so manual runs may fail the upload step when no installer files were produced.

If you need to publish directly from a macOS machine instead of CI, run this from `apps/desktop` with a GitHub token available as `GH_TOKEN`:

```bash
bun run dist:publish
```

That uses `electron-builder`'s direct GitHub publish path and targets the configured GitHub release provider.
