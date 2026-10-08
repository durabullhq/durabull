/** Do not mistake tenant/service-account policy failures for repairable OAuth scopes. */
export function readErrorMessage(failure: unknown): string {
  const value = failure && typeof failure === 'object' ? failure : {}
  const data = 'data' in value && value.data && typeof value.data === 'object' ? value.data : {}
  const code = 'code' in data ? data.code : undefined
  const message = failure instanceof Error ? failure.message : ''
  if (code === 'insufficient_scope' || /insufficient[_ ]scope/i.test(message)) {
    return 'This action needs additional scopes. Reconnect Durabull with those permissions, then retry.'
  }
  if (code === 'policy_denied' || /403|forbidden|access denied/i.test(message)) {
    return 'Access denied. Check your connection access or service-account policy with a Durabull administrator.'
  }
  if (/401|unauthoriz|token.*expired/i.test(message)) {
    return 'Your session is missing or expired. Reconnect Durabull, then retry.'
  }
  return 'Unable to load this view. Retry the request, or use the tools in chat.'
}
