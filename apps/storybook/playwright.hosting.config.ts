import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'hosting.spec.ts',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:6016',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'bun x serve ../docs/out -l 6016 --no-clipboard -c ../../storybook/serve.marketing.json',
    url: 'http://127.0.0.1:6016',
    reuseExistingServer: !process.env.CI,
  },
})
