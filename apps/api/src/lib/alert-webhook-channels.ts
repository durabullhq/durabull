import { assertAllowedWebhookUrl } from './alert-webhook-url'

export interface WebhookNotificationChannel {
  type: 'webhook'
  url: string
  secret?: string
}

export interface SavedWebhookNotificationChannel {
  type: 'webhook'
  destinationId: string
}

export interface SanitizedWebhookNotificationChannel {
  type: 'webhook'
  url: string
  secretConfigured: boolean
  secretLast4?: string
}

export interface SanitizedSavedWebhookNotificationChannel {
  type: 'webhook'
  destinationId: string
}

export function toWebhookDeliveryMetadata(
  channel: WebhookNotificationChannel
): SanitizedWebhookNotificationChannel {
  return sanitizeWebhookChannel(channel)
}

export function findWebhookSecretFromChannels(
  channels: unknown[] | null | undefined,
  url: string
): string | undefined {
  for (const channel of channels ?? []) {
    if (
      typeof channel === 'object' &&
      channel !== null &&
      (channel as { type?: string }).type === 'webhook' &&
      (channel as { url?: string }).url === url &&
      typeof (channel as { secret?: string }).secret === 'string'
    ) {
      const secret = (channel as { secret: string }).secret.trim()
      return secret.length > 0 ? secret : undefined
    }
  }
  return undefined
}

export function resolveWebhookTestSecret(
  url: string,
  explicitSecret: string | undefined,
  ruleChannels: unknown[] | null | undefined
): string | undefined {
  if (explicitSecret !== undefined) {
    const trimmed = explicitSecret.trim()
    return trimmed === '' ? undefined : trimmed
  }
  return findWebhookSecretFromChannels(ruleChannels, url)
}

export function sanitizeDeliveryProviderMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') return {}

  const { secret, encryptedSigningSecret, ...rest } = metadata
  if (rest.type !== 'webhook') {
    return rest
  }
  if (typeof rest.url !== 'string') return rest

  const secretConfigured =
    rest.secretConfigured === true || (typeof secret === 'string' && secret.trim().length > 0)
  const secretLast4 =
    typeof rest.secretLast4 === 'string'
      ? rest.secretLast4
      : typeof secret === 'string' && secret.length >= 4
        ? secret.slice(-4)
        : undefined

  return {
    ...rest,
    secretConfigured,
    ...(secretLast4 ? { secretLast4 } : {}),
  }
}

export function sanitizeAlertDeliveryForClient<
  T extends { providerMetadata?: Record<string, unknown> | null },
>(delivery: T): T {
  return {
    ...delivery,
    providerMetadata: sanitizeDeliveryProviderMetadata(delivery.providerMetadata),
  }
}

export function sanitizeWebhookChannel(
  channel: WebhookNotificationChannel
): SanitizedWebhookNotificationChannel {
  const secret = channel.secret?.trim()
  return {
    type: 'webhook',
    url: channel.url,
    secretConfigured: Boolean(secret),
    secretLast4: secret && secret.length >= 4 ? secret.slice(-4) : undefined,
  }
}

export function sanitizeNotificationChannels(channels: unknown[]): unknown[] {
  return channels.map((channel) => {
    if (
      typeof channel === 'object' &&
      channel !== null &&
      (channel as { type?: string }).type === 'webhook'
    ) {
      if (typeof (channel as { url?: string }).url === 'string') {
        const webhook = channel as WebhookNotificationChannel
        return sanitizeWebhookChannel(webhook)
      }
      if (typeof (channel as { destinationId?: string }).destinationId === 'string') {
        return {
          type: 'webhook',
          destinationId: (channel as SavedWebhookNotificationChannel).destinationId,
        } satisfies SanitizedSavedWebhookNotificationChannel
      }
    }
    return channel as Record<string, unknown>
  })
}

export function mergeWebhookSecretsOnUpdate<
  T extends { type: string; url?: string; secret?: string },
>(incomingChannels: T[], existingChannels: unknown[] | null | undefined): T[] {
  const existingByUrl = new Map<string, string>()
  for (const channel of existingChannels ?? []) {
    if (
      typeof channel === 'object' &&
      channel !== null &&
      (channel as { type?: string }).type === 'webhook' &&
      typeof (channel as { url?: string }).url === 'string' &&
      typeof (channel as { secret?: string }).secret === 'string'
    ) {
      existingByUrl.set((channel as { url: string }).url, (channel as { secret: string }).secret)
    }
  }

  return incomingChannels.map((channel) => {
    if (channel.type !== 'webhook' || typeof channel.url !== 'string') {
      return channel
    }

    if (channel.secret !== undefined) {
      if (channel.secret.trim() === '') {
        const { secret: _secret, ...rest } = channel
        return rest as T
      }
      return channel
    }

    const existingSecret = existingByUrl.get(channel.url)
    if (existingSecret) {
      return { ...channel, secret: existingSecret }
    }

    return channel
  })
}

export async function validateWebhookUrls(
  channels: WebhookNotificationChannel[]
): Promise<string | null> {
  for (const channel of channels) {
    try {
      await assertAllowedWebhookUrl(channel.url)
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }
  return null
}
