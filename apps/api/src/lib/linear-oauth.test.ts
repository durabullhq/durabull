import { afterEach, describe, expect, it } from 'bun:test'
import { env } from '@durabull/env'
import { buildLinearOauthAuthorizeUrl, getLinearOauthConfig } from './linear-oauth'

const mutableEnv = env as {
  APP_BASE_URL: string
  LINEAR_OAUTH_CLIENT_ID?: string
  LINEAR_OAUTH_CLIENT_SECRET?: string
  LINEAR_OAUTH_REDIRECT_URI?: string
  LINEAR_OAUTH_ACTOR: 'user' | 'app'
}

const originalAppBaseUrl = mutableEnv.APP_BASE_URL
const originalClientId = mutableEnv.LINEAR_OAUTH_CLIENT_ID
const originalClientSecret = mutableEnv.LINEAR_OAUTH_CLIENT_SECRET
const originalRedirectUri = mutableEnv.LINEAR_OAUTH_REDIRECT_URI
const originalActor = mutableEnv.LINEAR_OAUTH_ACTOR

describe('Linear OAuth helpers', () => {
  afterEach(() => {
    mutableEnv.APP_BASE_URL = originalAppBaseUrl
    mutableEnv.LINEAR_OAUTH_CLIENT_ID = originalClientId
    mutableEnv.LINEAR_OAUTH_CLIENT_SECRET = originalClientSecret
    mutableEnv.LINEAR_OAUTH_REDIRECT_URI = originalRedirectUri
    mutableEnv.LINEAR_OAUTH_ACTOR = originalActor
  })

  it('builds a cloud/self-host compatible callback from APP_BASE_URL by default', () => {
    mutableEnv.APP_BASE_URL = 'https://durabull.example.com///'
    mutableEnv.LINEAR_OAUTH_CLIENT_ID = 'client-id'
    mutableEnv.LINEAR_OAUTH_CLIENT_SECRET = 'client-secret'
    mutableEnv.LINEAR_OAUTH_REDIRECT_URI = undefined

    expect(getLinearOauthConfig()).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://durabull.example.com/api/alerts/integrations/linear/callback',
      actor: 'user',
    })
  })

  it('allows split-host self-hosting to override the callback URL explicitly', () => {
    mutableEnv.APP_BASE_URL = 'https://web.example.com'
    mutableEnv.LINEAR_OAUTH_CLIENT_ID = 'client-id'
    mutableEnv.LINEAR_OAUTH_CLIENT_SECRET = 'client-secret'
    mutableEnv.LINEAR_OAUTH_REDIRECT_URI =
      'https://api.example.com/api/alerts/integrations/linear/callback'

    expect(getLinearOauthConfig().redirectUri).toBe(
      'https://api.example.com/api/alerts/integrations/linear/callback'
    )
  })

  it('builds the Linear authorization URL with required OAuth parameters and least scopes', () => {
    const authorizationUrl = new URL(
      buildLinearOauthAuthorizeUrl({
        clientId: 'client-id',
        redirectUri: 'https://durabull.example.com/api/alerts/integrations/linear/callback',
        state: 'opaque-state',
        actor: 'user',
      })
    )

    expect(`${authorizationUrl.origin}${authorizationUrl.pathname}`).toBe(
      'https://linear.app/oauth/authorize'
    )
    expect(authorizationUrl.searchParams.get('client_id')).toBe('client-id')
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      'https://durabull.example.com/api/alerts/integrations/linear/callback'
    )
    expect(authorizationUrl.searchParams.get('response_type')).toBe('code')
    expect(authorizationUrl.searchParams.get('scope')).toBe('read,issues:create')
    expect(authorizationUrl.searchParams.get('state')).toBe('opaque-state')
    expect(authorizationUrl.searchParams.get('prompt')).toBe('consent')
    expect(authorizationUrl.searchParams.has('actor')).toBe(false)
  })

  it('can opt into Linear app actor authorization for service-account style installs', () => {
    mutableEnv.LINEAR_OAUTH_CLIENT_ID = 'client-id'
    mutableEnv.LINEAR_OAUTH_CLIENT_SECRET = 'client-secret'
    mutableEnv.LINEAR_OAUTH_ACTOR = 'app'

    expect(getLinearOauthConfig().actor).toBe('app')

    const authorizationUrl = new URL(
      buildLinearOauthAuthorizeUrl({
        clientId: 'client-id',
        redirectUri: 'https://durabull.example.com/api/alerts/integrations/linear/callback',
        state: 'opaque-state',
        actor: 'app',
      })
    )

    expect(authorizationUrl.searchParams.get('actor')).toBe('app')
  })
})
