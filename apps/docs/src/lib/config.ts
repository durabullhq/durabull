/**
 * Configuration for the docs/marketing site
 */

// The URL of the main web application (for auth links)
export const WEB_APP_URL = process.env.NEXT_PUBLIC_WEB_APP_URL || 'https://app.durabull.io'

// Site URL for this docs/marketing site
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://durabull.io'

// Desktop distribution and release links
export const GITHUB_RELEASE_URL = 'https://github.com/durabullhq/durabull/releases/latest'
export const MAC_DOWNLOAD_URL = GITHUB_RELEASE_URL
export const MAC_CHECKSUM_URL =
  'https://github.com/durabullhq/durabull/releases/latest/download/durabull-macos-arm64.sha256'
export const WINDOWS_DOWNLOAD_URL =
  'https://github.com/durabullhq/durabull/releases/download/v1.3.0/Durabull.Setup.1.3.0.exe'
export const WINDOWS_ZIP_DOWNLOAD_URL =
  'https://github.com/durabullhq/durabull/releases/download/v1.3.0/Durabull-1.3.0-win.zip'
export const HOMEBREW_INSTALL_COMMAND = 'brew install --cask durabullhq/tap/durabull'
export const MAC_VERIFY_DOWNLOAD_COMMAND = `curl -fsSLO ${MAC_CHECKSUM_URL} && shasum -a 256 -c durabull-macos-arm64.sha256`
