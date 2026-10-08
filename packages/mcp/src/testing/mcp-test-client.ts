import { MCP_ACCEPT_HEADER, MCP_CONTENT_TYPE, MCP_JSON_RPC_VERSION } from '../constants'

export { MCP_ACCEPT_HEADER, MCP_CONTENT_TYPE, MCP_JSON_RPC_VERSION }

export function mcpHeaders(
  host = 'localhost:3000',
  sessionId?: string,
  authorization?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    host,
    accept: MCP_ACCEPT_HEADER,
    'content-type': MCP_CONTENT_TYPE,
  }

  if (sessionId) {
    headers['mcp-session-id'] = sessionId
  }

  if (authorization) {
    headers.authorization = authorization
  }

  return headers
}

export function parseSseJson(body: string): unknown {
  const trimmed = body.trim()
  if (!trimmed) {
    throw new SyntaxError('Empty MCP response body')
  }

  const lastEvent = trimmed.split('\n\n').at(-1) ?? trimmed
  const dataLines = lastEvent
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))

  if (dataLines.length === 0) {
    return JSON.parse(trimmed)
  }

  return JSON.parse(dataLines.join('\n'))
}

export async function readMcpJsonResponse(response: Response): Promise<unknown> {
  return parseSseJson(await response.text())
}

export interface JsonRpcRequest {
  jsonrpc: typeof MCP_JSON_RPC_VERSION
  id?: number | string
  method: string
  params?: Record<string, unknown>
}

export async function postMcpJson(
  request: (path: string, init?: RequestInit) => Promise<Response>,
  path: string,
  body: JsonRpcRequest | Record<string, unknown>,
  options: { host?: string; sessionId?: string; authorization?: string } = {}
): Promise<Response> {
  return request(path, {
    method: 'POST',
    headers: mcpHeaders(options.host, options.sessionId, options.authorization),
    body: JSON.stringify(body),
  })
}
