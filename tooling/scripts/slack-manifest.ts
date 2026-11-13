/**
 * Prints the Slack app manifest for a Durabull deployment.
 *
 *   bun run slack:manifest                         # uses APP_BASE_URL
 *   bun run slack:manifest -- --base-url https://durabull.example.com --name "Durabull (staging)"
 *   bun run slack:manifest -- --skip-events    # create the app before Durabull is reachable
 *   bun run slack:manifest -- --redirect-uri https://api.example.com/api/integrations/slack/callback
 *
 * Paste the JSON at https://api.slack.com/apps → Create New App → From a manifest.
 */
import { parseArgs } from 'node:util'

// Keep stdout pure JSON so it can be piped or pasted straight into Slack.
process.env.DOTENV_CONFIG_QUIET = 'true'
const { env } = await import('@durabull/env')
const { buildSlackAppManifest } = await import('../../apps/api/src/lib/slack/manifest')

const { values } = parseArgs({
  options: {
    'base-url': { type: 'string' },
    name: { type: 'string' },
    'skip-events': { type: 'boolean' },
    'redirect-uri': { type: 'string' },
  },
})

const baseUrl = values['base-url'] ?? env.APP_BASE_URL
let parsed: URL
try {
  parsed = new URL(baseUrl)
} catch {
  console.error(`Invalid base URL: ${baseUrl}`)
  process.exit(1)
}
if (parsed.protocol !== 'https:') {
  console.error(
    `Slack only calls HTTPS endpoints. ${baseUrl} is not HTTPS; use a tunnel (for example ngrok) for local development.`
  )
  process.exit(1)
}

console.log(
  JSON.stringify(
    buildSlackAppManifest({
      baseUrl,
      appName: values.name,
      skipEvents: values['skip-events'],
      redirectUri: values['redirect-uri'],
    }),
    null,
    2
  )
)
