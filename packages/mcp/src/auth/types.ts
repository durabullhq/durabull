export interface McpAccessTokenClaims {
  accessToken: string
  clientName?: string
  clientId: string
  userId: string | null
  scopes: string[]
  accessTokenExpiresAt: Date
  /** RFC 8707 resource indicator bound at token issuance, when present. */
  resource?: string | null
}

export type McpTokenValidationResult =
  | { ok: true; claims: McpAccessTokenClaims }
  | { ok: false; status: 401 | 403; error: string; missingScopes?: string[] }
