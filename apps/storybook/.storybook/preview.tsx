import type { Preview } from '@storybook/react-vite'
import { CatalogProvider } from '../src/catalog-provider'
import { controlledStory } from '../src/controlled-story'
import { setFixtureState, setUpdateAvailable, startFixtures } from '../src/fixtures/network'
import { setSignedIn } from '../src/mocks/auth'
import { setDesktop } from '../src/mocks/desktop'
import '../src/catalog.css'

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Color theme',
      toolbar: { icon: 'circlehollow', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light' },
  loaders: [
    async ({ parameters, globals }) => {
      localStorage.setItem('durabull-theme', globals.theme === 'dark' ? 'dark' : 'light')
      await startFixtures()
      setFixtureState(parameters.fixtureState ?? 'ready')
      setUpdateAvailable(parameters.updateAvailable === true)
      setSignedIn(parameters.signedIn !== false)
      setDesktop(parameters.desktop === true)
      return {}
    },
  ],
  decorators: [
    controlledStory,
    (Story, context) => (
      <CatalogProvider
        key={`${context.id}-${context.parameters.fixtureState ?? 'ready'}`}
        theme={context.globals.theme === 'dark' ? 'dark' : 'light'}
      >
        {context.title.startsWith('Marketing/') ? (
          <div className="v2">
            <Story />
          </div>
        ) : (
          <Story />
        )}
      </CatalogProvider>
    ),
  ],
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    options: {
      storySort: {
        order: [
          'Start Here',
          'Foundations',
          'Web Components',
          'Web Screens',
          'Desktop',
          'Marketing',
          'Email',
          'MCP Apps',
        ],
      },
    },
    docs: { toc: true },
  },
  tags: ['autodocs'],
}
export default preview
