/** Do not mistake tenant/service-account policy failures for repairable OAuth scopes. */
export function readErrorMessage(failure: unknown): string {
  const value = failure && typeof failure === 'object' ? failure : {}
  const data = 'data' in value && value.data && typeof value.data === 'object' ? value.data : {}
  const code = 'code' in data ? data.code : undefined
  const message = failure instanceof Error ? failure.message : ''
  if (
    ('code' in value && value.code === -32029) ||
    code === 'RATE_LIMITED' ||
    /429|rate.limit|budget exhausted/i.test(message)
  ) {
    const retry = 'retryAfter' in data ? data.retryAfter : undefined
    if (typeof retry === 'number' && Number.isFinite(retry) && retry > 0 && retry <= 3600) {
      const seconds = Math.ceil(retry)
      return `This request reached its burst budget. Retry in ${seconds} second${seconds === 1 ? '' : 's'}.`
    }
    return 'This request reached its burst budget. Wait briefly, then retry; reconnecting is not required.'
  }
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
