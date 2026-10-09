import './styles.css'
import { App, applyDocumentTheme } from '@modelcontextprotocol/ext-apps'
import { createRoot } from 'react-dom/client'
import { Explorer } from './explorer'
import { Shell } from './shell'

// The host is the only network boundary. No tokens, fetch(), remote fonts or localStorage.
const app = new App({ name: 'Durabull queue explorer', version: '2.0.0' }, {}, { autoResize: true })
const explorer = new Explorer(app)
const html = document.documentElement

/**
 * Adopt the host's theme and typefaces so cards read as native. Other host style variables
 * are not applied: their names overlap Apps SDK UI tokens with different meanings.
 */
function applyContext() {
  const context = app.getHostContext()
  applyDocumentTheme(
    context?.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  )
  const variables = context?.styles?.variables
  for (const key of ['--font-sans', '--font-mono'] as const) {
    const value = variables?.[key]
    if (value) html.style.setProperty(key, value)
  }
  const insets = context?.safeAreaInsets
  if (insets) {
    document.body.style.padding = `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`
  }
  explorer.hostChanged(context)
}

app.ontoolinput = ({ arguments: args }) => explorer.toolInput(args)
app.ontoolresult = (result) => explorer.toolResult(result)
app.ontoolcancelled = () => explorer.toolCancelled()
app.onhostcontextchanged = applyContext
app.onteardown = async () => {
  explorer.teardown()
  return {}
}

applyContext()
createRoot(document.getElementById('app')!).render(<Shell explorer={explorer} />)
try {
  await app.connect()
  explorer.connected(app.getHostContext())
  applyContext()
} catch {
  explorer.connectionFailed()
}
