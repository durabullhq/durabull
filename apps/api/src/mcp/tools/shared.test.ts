import { beforeEach, describe, expect, it, mock } from 'bun:test'

const canDelegatedUserAccessConnection = mock(async () => true)
const findById = mock(async () => null)
const findByIdUnsafe = mock(async () => null)

mock.module('@durabull/dal', () => ({
  mcpPolicyRepository: {
    canDelegatedUserAccessConnection,
  },
  redisConnectionRepository: {
    findById,
    findByIdUnsafe,
  },
}))

const { resolveConnectionForPrincipal } = await import('../connections/resolve-connection')

describe('resolveConnectionForPrincipal', () => {
  beforeEach(() => {
    canDelegatedUserAccessConnection.mockReset()
    canDelegatedUserAccessConnection.mockImplementation(async () => true)
    findById.mockReset()
    findByIdUnsafe.mockReset()
    findByIdUnsafe.mockImplementation((async () => ({
      id: 'conn-1',
      organizationId: 'org-1',
      url: 'https://redis.example.com',
      mode: 'standalone',
      prefix: 'queues',
      allowSelfSignedCerts: false,
    })) as never)
  })

  it('skips delegated access re-check when policy already verified access', async () => {
    const connection = await resolveConnectionForPrincipal(
      {
        type: 'delegated_user',
        principalId: 'principal-1',
        userId: 'user-1',
      },
      'conn-1',
      { skipDelegatedAccessCheck: true }
    )

    expect(connection?.id).toBe('conn-1')
    expect(canDelegatedUserAccessConnection).not.toHaveBeenCalled()
    expect(findByIdUnsafe).toHaveBeenCalledTimes(1)
  })

  it('still enforces delegated access checks by default', async () => {
    canDelegatedUserAccessConnection.mockImplementation(async () => false)

    const connection = await resolveConnectionForPrincipal(
      {
        type: 'delegated_user',
        principalId: 'principal-1',
        userId: 'user-1',
      },
      'conn-1'
    )

    expect(connection).toBeNull()
    expect(canDelegatedUserAccessConnection).toHaveBeenCalledTimes(1)
    expect(findByIdUnsafe).not.toHaveBeenCalled()
  })
})
