import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { mcpPolicyRepository, redisConnectionRepository } from '@durabull/dal'
import { resolveConnectionForPrincipal } from '../connections/resolve-connection'

const canDelegatedUserAccessConnection = mock(async () => true)
const findById = mock(async () => null)
const findByIdUnsafe = mock(redisConnectionRepository.findByIdUnsafe)

describe('resolveConnectionForPrincipal', () => {
  afterEach(() => mock.restore())

  beforeEach(() => {
    spyOn(mcpPolicyRepository, 'canDelegatedUserAccessConnection').mockImplementation(
      canDelegatedUserAccessConnection
    )
    spyOn(redisConnectionRepository, 'findById').mockImplementation(findById)
    spyOn(redisConnectionRepository, 'findByIdUnsafe').mockImplementation(findByIdUnsafe)
    canDelegatedUserAccessConnection.mockReset()
    canDelegatedUserAccessConnection.mockImplementation(async () => true)
    findById.mockReset()
    findByIdUnsafe.mockReset()
    findByIdUnsafe.mockImplementation(async () => ({
      id: 'conn-1',
      organizationId: 'org-1',
      name: 'Test connection',
      environment: null,
      url: 'https://redis.example.com',
      prefix: 'queues',
      allowSelfSignedCerts: false,
      isDefault: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
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
