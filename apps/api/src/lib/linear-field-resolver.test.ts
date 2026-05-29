import { describe, expect, it } from 'bun:test'
import { LinearApiError, type LinearMetadata } from './linear-client'
import { fieldsNeedResolution, resolveLinearIssueFieldsWithMetadata } from './linear-field-resolver'

const TEAM_UUID = '11111111-1111-1111-1111-111111111111'
const PROJECT_UUID = '22222222-2222-2222-2222-222222222222'
const LABEL_UUID = '33333333-3333-3333-3333-333333333333'
const USER_UUID = '44444444-4444-4444-4444-444444444444'
const STATE_UUID = '55555555-5555-5555-5555-555555555555'

const metadata: LinearMetadata = {
  teams: [{ id: TEAM_UUID, name: 'Intake', key: 'INTAKE' }],
  projects: [{ id: PROJECT_UUID, name: 'Q3 Roadmap' }],
  labels: [{ id: LABEL_UUID, name: 'Bug' }],
  users: [{ id: USER_UUID, name: 'Ada Lovelace', email: 'ada@example.com' }],
  states: [{ id: STATE_UUID, name: 'Triage', teamId: TEAM_UUID }],
}

describe('fieldsNeedResolution', () => {
  it('returns false when every value is already a UUID', () => {
    expect(
      fieldsNeedResolution({
        teamId: TEAM_UUID,
        projectId: PROJECT_UUID,
        labelIds: [LABEL_UUID],
        assigneeId: USER_UUID,
        stateId: STATE_UUID,
      })
    ).toBe(false)
  })

  it('returns true when a friendly value (team key) is present', () => {
    expect(fieldsNeedResolution({ teamId: 'INTAKE' })).toBe(true)
  })
})

describe('resolveLinearIssueFieldsWithMetadata', () => {
  it('resolves a team key to its UUID', () => {
    const resolved = resolveLinearIssueFieldsWithMetadata(metadata, { teamId: 'INTAKE' })
    expect(resolved.teamId).toBe(TEAM_UUID)
  })

  it('resolves a team name case-insensitively', () => {
    const resolved = resolveLinearIssueFieldsWithMetadata(metadata, { teamId: 'intake' })
    expect(resolved.teamId).toBe(TEAM_UUID)
  })

  it('passes a team UUID through unchanged', () => {
    const resolved = resolveLinearIssueFieldsWithMetadata(metadata, { teamId: TEAM_UUID })
    expect(resolved.teamId).toBe(TEAM_UUID)
  })

  it('resolves optional fields by friendly values', () => {
    const resolved = resolveLinearIssueFieldsWithMetadata(metadata, {
      teamId: 'INTAKE',
      projectId: 'Q3 Roadmap',
      labelIds: ['Bug'],
      assigneeId: 'ada@example.com',
      stateId: 'Triage',
      priority: 2,
    })

    expect(resolved).toEqual({
      teamId: TEAM_UUID,
      projectId: PROJECT_UUID,
      labelIds: [LABEL_UUID],
      assigneeId: USER_UUID,
      stateId: STATE_UUID,
      priority: 2,
    })
  })

  it('drops unresolved optional fields so the issue is still created', () => {
    const resolved = resolveLinearIssueFieldsWithMetadata(metadata, {
      teamId: 'INTAKE',
      projectId: 'Nonexistent project',
      labelIds: ['Bug', 'Unknown label'],
      assigneeId: 'nobody@example.com',
      stateId: 'Unknown state',
    })

    expect(resolved.projectId).toBeUndefined()
    expect(resolved.assigneeId).toBeUndefined()
    expect(resolved.stateId).toBeUndefined()
    expect(resolved.labelIds).toEqual([LABEL_UUID])
  })

  it('scopes state resolution to the resolved team when possible', () => {
    const otherTeam = '66666666-6666-6666-6666-666666666666'
    const scopedMetadata: LinearMetadata = {
      ...metadata,
      states: [
        { id: STATE_UUID, name: 'Triage', teamId: TEAM_UUID },
        { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Triage', teamId: otherTeam },
      ],
    }
    const resolved = resolveLinearIssueFieldsWithMetadata(scopedMetadata, {
      teamId: 'INTAKE',
      stateId: 'Triage',
    })
    expect(resolved.stateId).toBe(STATE_UUID)
  })

  it('throws a non-retryable error when the team cannot be resolved', () => {
    try {
      resolveLinearIssueFieldsWithMetadata(metadata, { teamId: 'NOPE' })
      throw new Error('expected resolver to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(LinearApiError)
      const apiError = error as LinearApiError
      expect(apiError.retryable).toBe(false)
      expect(apiError.message).toContain('Intake (INTAKE)')
    }
  })
})
