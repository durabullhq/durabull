import { buildWwwAuthenticateChallenge, mcpAuthResponseHeaders } from './www-authenticate'

export function buildMcpUnauthorizedResponse(
  resourceMetadataUrl: string,
  options?: { errorDescription?: string }
): Response {
  const challenge = buildWwwAuthenticateChallenge({
    resourceMetadataUrl,
    error: 'invalid_token',
    errorDescription: options?.errorDescription ?? 'The access token is invalid or expired',
  })

  return Response.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32_000,
        message: 'Unauthorized: Authentication required',
      },
      id: null,
    },
    { status: 401, headers: mcpAuthResponseHeaders(challenge) }
  )
}

export function buildMcpMissingBearerResponse(resourceMetadataUrl: string): Response {
  const challenge = buildWwwAuthenticateChallenge({ resourceMetadataUrl })

  return Response.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32_000,
        message: 'Unauthorized: Authentication required',
      },
      id: null,
    },
    { status: 401, headers: mcpAuthResponseHeaders(challenge) }
  )
}

export function buildMcpInsufficientScopeResponse(
  resourceMetadataUrl: string,
  requiredScopes: readonly string[]
): Response {
  const scopeList = requiredScopes.join(' ')
  const challenge = buildWwwAuthenticateChallenge({
    resourceMetadataUrl,
    error: 'insufficient_scope',
    scope: scopeList,
  })

  return Response.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32_003,
        message: 'Forbidden: Insufficient scope',
        data: { required_scopes: [...requiredScopes] },
      },
      id: null,
    },
    { status: 403, headers: mcpAuthResponseHeaders(challenge) }
  )
}
