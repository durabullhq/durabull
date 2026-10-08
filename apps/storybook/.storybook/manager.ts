import { addons } from 'storybook/manager-api'
import { create } from 'storybook/theming'

addons.setConfig({
  theme: create({
    base: 'light',
    brandTitle: 'Durabull · UI catalog',
    brandUrl: 'https://durabull.io',
    colorPrimary: '#13795b',
    colorSecondary: '#13795b',
    appBg: '#f4f6f3',
    appContentBg: '#ffffff',
    appBorderColor: '#dce3dc',
    appBorderRadius: 6,
    textColor: '#192e25',
    barSelectedColor: '#13795b',
  }),
  sidebar: { showRoots: true },
})
