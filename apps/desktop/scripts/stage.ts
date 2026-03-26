import { chmod, copyFile, cp, mkdir, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const workspaceRoot = resolve(scriptDir, '../../..')
const desktopRoot = resolve(scriptDir, '..')
const distRoot = join(desktopRoot, 'dist')
const bundleRoot = join(distRoot, 'app-bundle')
const bunBinRoot = join(distRoot, 'bin')

function assertPathExists(path: string, label: string): void {
  if (existsSync(path)) return
  throw new Error(`${label} was not found at ${path}. Build the dependent workspace first.`)
}

async function resolveBunExecutable(): Promise<string> {
  const executable = process.execPath
  if (executable.endsWith('bun') || executable.endsWith('bun.exe')) {
    return executable
  }

  throw new Error(`Expected this script to run with Bun, but received ${executable}.`)
}

async function copyDirectory(source: string, destination: string): Promise<void> {
  assertPathExists(source, 'Required build output')
  await cp(source, destination, { recursive: true, force: true })
}

async function resolvePgliteDist(): Promise<string> {
  const bunPackagesRoot = join(workspaceRoot, 'node_modules', '.bun')
  const entries = await readdir(bunPackagesRoot, { withFileTypes: true })
  const pgliteEntry = entries.find(
    (entry) => entry.isDirectory() && entry.name.startsWith('@electric-sql+pglite@')
  )

  if (!pgliteEntry) {
    throw new Error('Unable to locate @electric-sql/pglite inside Bun install artifacts.')
  }

  return join(bunPackagesRoot, pgliteEntry.name, 'node_modules', '@electric-sql', 'pglite', 'dist')
}

async function main() {
  const apiDistSource = join(workspaceRoot, 'apps', 'api', 'dist')
  const webDistSource = join(workspaceRoot, 'apps', 'web', 'dist')
  const migrationsSource = join(workspaceRoot, 'packages', 'dal', 'src', 'db', 'migrations')
  const pgliteDistSource = await resolvePgliteDist()
  const bunSource = await resolveBunExecutable()
  const bunBinaryName = basename(bunSource)
  const stagedApiDist = join(bundleRoot, 'apps', 'api', 'dist')

  await mkdir(distRoot, { recursive: true })
  await rm(bundleRoot, { recursive: true, force: true })
  await rm(bunBinRoot, { recursive: true, force: true })

  await copyDirectory(apiDistSource, stagedApiDist)
  await copyDirectory(webDistSource, join(bundleRoot, 'apps', 'web', 'dist'))
  await copyDirectory(migrationsSource, join(stagedApiDist, 'migrations'))
  await copyFile(join(pgliteDistSource, 'pglite.data'), join(stagedApiDist, 'pglite.data'))
  await copyFile(join(pgliteDistSource, 'pglite.wasm'), join(stagedApiDist, 'pglite.wasm'))

  await mkdir(bunBinRoot, { recursive: true })
  const bunDestination = join(bunBinRoot, bunBinaryName)
  await copyFile(bunSource, bunDestination)

  if (process.platform !== 'win32') {
    await chmod(bunDestination, 0o755)
  }

  console.log(`Staged desktop runtime in ${bundleRoot}`)
}

await main()
