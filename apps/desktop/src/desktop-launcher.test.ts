import { describe, expect, it } from 'bun:test'
import {
  brandMacAppBundlePlist,
  buildDesktopLauncherEnv,
  DESKTOP_RESOURCE_ROOT_ENV,
  resolveDesktopResourceRoot,
} from './desktop-launcher'

const SAMPLE_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>Electron</string>
  <key>CFBundleExecutable</key>
  <string>Electron</string>
  <key>CFBundleIdentifier</key>
  <string>com.github.Electron</string>
  <key>CFBundleName</key>
  <string>Electron</string>
</dict>
</plist>`

describe('resolveDesktopResourceRoot', () => {
  it('prefers the explicit launcher resource-root override', () => {
    expect(
      resolveDesktopResourceRoot({
        appPath: '/workspace/apps/desktop',
        envRoot: '/workspace/apps/desktop/dist',
        isPackaged: true,
        resourcesPath: '/Applications/Durabull.app/Contents/Resources',
      })
    ).toBe('/workspace/apps/desktop/dist')
  })

  it('uses process.resourcesPath for packaged builds without an override', () => {
    expect(
      resolveDesktopResourceRoot({
        appPath: '/workspace/apps/desktop',
        isPackaged: true,
        resourcesPath: '/Applications/Durabull.app/Contents/Resources',
      })
    ).toBe('/Applications/Durabull.app/Contents/Resources')
  })

  it('falls back to appPath/dist for unpackaged development runs', () => {
    expect(
      resolveDesktopResourceRoot({
        appPath: '/workspace/apps/desktop',
        isPackaged: false,
        resourcesPath: '/Applications/Durabull.app/Contents/Resources',
      })
    ).toBe('/workspace/apps/desktop/dist')
  })
})

describe('buildDesktopLauncherEnv', () => {
  it('preserves the parent environment and injects the desktop dist root', () => {
    const env = buildDesktopLauncherEnv({ FOO: 'bar' }, '/workspace/apps/desktop')

    expect(env.FOO).toBe('bar')
    expect(env[DESKTOP_RESOURCE_ROOT_ENV]).toBe('/workspace/apps/desktop/dist')
  })
})

describe('brandMacAppBundlePlist', () => {
  it('rewrites the mac app bundle metadata to the branded app name', () => {
    const branded = brandMacAppBundlePlist(SAMPLE_PLIST, {
      bundleId: 'com.durabull.desktop.dev',
      productName: 'Durabull',
    })

    expect(branded).toContain('<key>CFBundleDisplayName</key>\n  <string>Durabull</string>')
    expect(branded).toContain('<key>CFBundleExecutable</key>\n  <string>Durabull</string>')
    expect(branded).toContain(
      '<key>CFBundleIdentifier</key>\n  <string>com.durabull.desktop.dev</string>'
    )
    expect(branded).toContain('<key>CFBundleName</key>\n  <string>Durabull</string>')
  })
})
