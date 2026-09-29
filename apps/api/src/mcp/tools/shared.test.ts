import { beforeEach, describe, expect, it, mock } from 'bun:test'

const canDelegatedUserAccessConnection = mock(async () => true)
type MockConnection = {
  id: string
  organizationId: string
  url: string
  prefix: string
  allowSelfSignedCerts: boolean
}
const findById = mock(async (): Promise<MockConnection | null> => null)
const findByIdUnsafe = mock(async (): Promise<MockConnection | null> => null)

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
    findByIdUnsafe.mockImplementation(async () => ({
      id: 'conn-1',
      organizationId: 'org-1',
      url: 'https://redis.example.com',
      prefix: 'queues',
      allowSelfSignedCerts: false,
    }))
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
