import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandMacAppBundlePlist, buildDesktopLauncherEnv } from '../src/desktop-launcher'

const PRODUCT_NAME = 'Durabull'
const DEV_BUNDLE_ID = 'com.durabull.desktop.dev'
const require = createRequire(import.meta.url)
const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const desktopRoot = resolve(scriptDir, '..')
const devBundleRoot = join(desktopRoot, 'dist', 'dev-macos')
const devAppPath = join(devBundleRoot, `${PRODUCT_NAME}.app`)
const prepareOnly = process.argv.includes('--prepare-only')

function resolveElectronPackageRoot(): string {
  return dirname(require.resolve('electron/package.json'))
}

function resolveElectronBinaryPath(): string {
  const electronBinaryPath = require('electron')

  if (typeof electronBinaryPath !== 'string') {
    throw new Error('Expected the electron package to resolve to a binary path.')
  }

  return electronBinaryPath
}

async function prepareMacLauncher(): Promise<string> {
  const electronAppPath = join(resolveElectronPackageRoot(), 'dist', 'Electron.app')

  if (!existsSync(electronAppPath)) {
    throw new Error(`Electron.app was not found at ${electronAppPath}.`)
  }

  await mkdir(devBundleRoot, { recursive: true })
  await rm(devAppPath, { recursive: true, force: true })
  await cp(electronAppPath, devAppPath, { recursive: true, force: true })

  const plistPath = join(devAppPath, 'Contents', 'Info.plist')
  const plistContents = await readFile(plistPath, 'utf8')

  await writeFile(
    plistPath,
    brandMacAppBundlePlist(plistContents, {
      bundleId: DEV_BUNDLE_ID,
      productName: PRODUCT_NAME,
    }),
    'utf8'
  )

  const originalExecutablePath = join(devAppPath, 'Contents', 'MacOS', 'Electron')
  const brandedExecutablePath = join(devAppPath, 'Contents', 'MacOS', PRODUCT_NAME)

  if (!existsSync(originalExecutablePath)) {
    throw new Error(`Electron executable was not found at ${originalExecutablePath}.`)
  }

  await rm(brandedExecutablePath, { force: true })
  await rename(originalExecutablePath, brandedExecutablePath)

  return brandedExecutablePath
}

function launchDesktop(binaryPath: string): ChildProcess {
  return spawn(binaryPath, ['.'], {
    cwd: desktopRoot,
    env: buildDesktopLauncherEnv(process.env, desktopRoot),
    stdio: 'inherit',
  })
}

function forwardSignals(child: ChildProcess): void {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      if (!child.killed) {
        child.kill(signal)
      }
    })
  }
}

async function main() {
  const binaryPath =
    process.platform === 'darwin' ? await prepareMacLauncher() : resolveElectronBinaryPath()

  if (prepareOnly) {
    console.log(binaryPath)
    return
  }

  const child = launchDesktop(binaryPath)
  forwardSignals(child)

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 0))
  })

  process.exit(exitCode)
}

await main()
