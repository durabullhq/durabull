import {
  GITHUB_RELEASE_URL,
  HOMEBREW_INSTALL_COMMAND,
  MAC_DOWNLOAD_URL,
  SITE_URL,
  WEB_APP_URL,
} from '@/lib/config'

export const home2Links = {
  signup: `${WEB_APP_URL}/signup`,
  signin: WEB_APP_URL,
  documentation: '/documentation',
  changelog: '/changelog',
  roadmap: '/roadmap',
  pricing: '#pricing',
  product: '#product',
  deploy: '#deploy',
  faq: '#faq',
  github: 'https://github.com/durabullhq/durabull',
  contact: 'mailto:hello@durabull.io',
  site: SITE_URL,
  macDownload: MAC_DOWNLOAD_URL,
  homebrew: HOMEBREW_INSTALL_COMMAND,
  dockerImage: 'durabullhq/durabull',
  releases: GITHUB_RELEASE_URL,
} as const
