import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StorybookConfig } from '@storybook/react-vite'
import tailwindcss from '@tailwindcss/vite'
import { mcpAppPlugin } from './mcp-app-plugin'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const local = (name: string) => path.join(root, 'apps/storybook/src/mocks', name)
const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: '@storybook/react-vite',
  staticDirs: ['../public', '../../docs/public', '../../web/public'],
  core: { disableTelemetry: true },
  typescript: { reactDocgen: 'react-docgen' },
  async viteFinal(config) {
    config.plugins = [...(config.plugins ?? []), tailwindcss(), mcpAppPlugin(root)]
    config.resolve = {
      ...config.resolve,
      alias: [
        { find: '@/hooks/use-electron-shell', replacement: local('desktop.ts') },
        { find: '@durabull/auth/client', replacement: local('auth.ts') },
        { find: /^@durabull\/analytics\/(browser|client)$/, replacement: local('analytics.ts') },
        { find: 'next/link', replacement: local('next-link.tsx') },
        { find: 'next/image', replacement: local('next-image.tsx') },
        { find: 'next/navigation', replacement: local('next-navigation.ts') },
        { find: /^@docs\//, replacement: `${root}/apps/docs/src/` },
        {
          find: /^@\//,
          replacement: '@/',
          customResolver(source, importer) {
            const folder = importer?.includes('/apps/docs/') ? 'docs' : 'web'
            return this.resolve(path.join(root, `apps/${folder}/src`, source.slice(2)), importer, {
              skipSelf: true,
            })
          },
        },
      ],
      dedupe: ['react', 'react-dom'],
    }
    config.define = {
      ...config.define,
      __DURABULL_APP_VERSION__: JSON.stringify('storybook'),
      __DURABULL_BUILD_ID__: JSON.stringify('public-preview'),
      __DURABULL_BUILD_TIME__: 'null',
      'process.env.NEXT_PUBLIC_WEB_APP_URL': JSON.stringify('https://app.durabull.io'),
      'process.env.NEXT_PUBLIC_SITE_URL': JSON.stringify('https://durabull.io'),
    }
    config.esbuild = { ...config.esbuild, jsx: 'automatic', jsxImportSource: 'react' }
    config.build = { ...config.build, sourcemap: false }
    return config
  },
}
export default config
