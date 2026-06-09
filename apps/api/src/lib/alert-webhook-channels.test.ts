import { describe, expect, it } from 'bun:test'
import {
  findWebhookSecretFromChannels,
  mergeWebhookSecretsOnUpdate,
  resolveWebhookTestSecret,
  sanitizeDeliveryProviderMetadata,
  sanitizeNotificationChannels,
  sanitizeWebhookChannel,
  toWebhookDeliveryMetadata,
} from './alert-webhook-channels'

describe('sanitizeWebhookChannel', () => {
  it('masks webhook secrets on read', () => {
    expect(
      sanitizeWebhookChannel({
        type: 'webhook',
        url: 'https://example.com/hook',
        secret: 'super-secret-signing-key',
      })
    ).toEqual({
      type: 'webhook',
      url: 'https://example.com/hook',
      secretConfigured: true,
      secretLast4: '-key',
    })
  })
})

describe('mergeWebhookSecretsOnUpdate', () => {
  it('preserves existing secrets when omitted from updates', () => {
    const merged = mergeWebhookSecretsOnUpdate(
      [{ type: 'webhook', url: 'https://example.com/hook' }],
      [{ type: 'webhook', url: 'https://example.com/hook', secret: 'existing-secret-value' }]
    )

    expect((merged[0] as { secret?: string }).secret).toBe('existing-secret-value')
  })

  it('clears secrets when an empty string is submitted', () => {
    const merged = mergeWebhookSecretsOnUpdate(
      [{ type: 'webhook', url: 'https://example.com/hook', secret: '' }],
      [{ type: 'webhook', url: 'https://example.com/hook', secret: 'existing-secret-value' }]
    )

    expect((merged[0] as { secret?: string }).secret).toBeUndefined()
  })
})

describe('sanitizeNotificationChannels', () => {
  it('sanitizes webhook channels in mixed channel lists', () => {
    const sanitized = sanitizeNotificationChannels([
      { type: 'email', target: 'ops@example.com' },
      { type: 'webhook', url: 'https://example.com/hook', secret: 'abcdefghijklmnop' },
    ])

    expect(sanitized[1]).toEqual({
      type: 'webhook',
      url: 'https://example.com/hook',
      secretConfigured: true,
      secretLast4: 'mnop',
    })
  })

  it('preserves saved webhook destination references', () => {
    const sanitized = sanitizeNotificationChannels([
      { type: 'webhook', destinationId: 'destination-id' },
    ])

    expect(sanitized).toEqual([{ type: 'webhook', destinationId: 'destination-id' }])
  })
})

describe('toWebhookDeliveryMetadata', () => {
  it('stores webhook delivery metadata without secrets', () => {
    expect(
      toWebhookDeliveryMetadata({
        type: 'webhook',
        url: 'https://example.com/hook',
        secret: 'abcdefghijklmnop',
      })
    ).toEqual({
      type: 'webhook',
      url: 'https://example.com/hook',
      secretConfigured: true,
      secretLast4: 'mnop',
    })
  })
})

describe('findWebhookSecretFromChannels', () => {
  it('finds a webhook secret by URL', () => {
    expect(
      findWebhookSecretFromChannels(
        [{ type: 'webhook', url: 'https://example.com/hook', secret: 'stored-secret-value' }],
        'https://example.com/hook'
      )
    ).toBe('stored-secret-value')
  })
})

describe('resolveWebhookTestSecret', () => {
  it('uses the saved rule secret when the request omits one', () => {
    expect(
      resolveWebhookTestSecret('https://example.com/hook', undefined, [
        { type: 'webhook', url: 'https://example.com/hook', secret: 'stored-secret-value' },
      ])
    ).toBe('stored-secret-value')
  })

  it('prefers an explicit secret from the request body', () => {
    expect(
      resolveWebhookTestSecret('https://example.com/hook', 'override-secret-value', [
        { type: 'webhook', url: 'https://example.com/hook', secret: 'stored-secret-value' },
      ])
    ).toBe('override-secret-value')
  })
})

describe('sanitizeDeliveryProviderMetadata', () => {
  it('removes webhook secrets from delivery metadata', () => {
    expect(
      sanitizeDeliveryProviderMetadata({
        type: 'webhook',
        url: 'https://example.com/hook',
        secret: 'abcdefghijklmnop',
        httpStatus: 200,
      })
    ).toEqual({
      type: 'webhook',
      url: 'https://example.com/hook',
      httpStatus: 200,
      secretConfigured: true,
      secretLast4: 'mnop',
    })
  })

  it('removes encrypted webhook secrets from delivery metadata', () => {
    expect(
      sanitizeDeliveryProviderMetadata({
        type: 'webhook',
        destinationId: 'destination-id',
        url: 'https://example.com/hook',
        encryptedSigningSecret: 'enc:v1:redacted',
        secretConfigured: true,
        secretLast4: 'mnop',
      })
    ).toEqual({
      type: 'webhook',
      destinationId: 'destination-id',
      url: 'https://example.com/hook',
      secretConfigured: true,
      secretLast4: 'mnop',
    })
  })
})
