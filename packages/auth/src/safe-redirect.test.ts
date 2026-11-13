import { describe, expect, test } from 'bun:test'
import { isSafeAppRedirectPath, isSafeOAuthRedirectUri, resolveSafeAppRedirectPath } from './safe-redirect'

describe('safe-redirect', () => {
  test('rejects protocol-relative and external paths', () => {
    expect(isSafeAppRedirectPath('/consent')).toBe(true)
    expect(isSafeAppRedirectPath('//evil.com')).toBe(false)
    expect(isSafeAppRedirectPath('/\\evil')).toBe(false)
    expect(isSafeAppRedirectPath('https://evil.com')).toBe(false)
  })

  test('resolveSafeAppRedirectPath requires same origin', () => {
    const origin = 'http://localhost:5173'
    expect(resolveSafeAppRedirectPath('/consent?x=1', origin)).toBe('/consent?x=1')
    expect(resolveSafeAppRedirectPath('//evil.com', origin)).toBeUndefined()
  })

  test('isSafeOAuthRedirectUri allows http(s) only', () => {
    expect(isSafeOAuthRedirectUri('http://127.0.0.1:8765/callback')).toBe(true)
    expect(isSafeOAuthRedirectUri('javascript:alert(1)')).toBe(false)
  })
})
