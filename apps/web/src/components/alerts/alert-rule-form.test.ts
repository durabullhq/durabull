import { describe, expect, it } from 'vitest'
import {
  ALERT_RULE_TEMPLATES,
  buildSentenceTokens,
  createAlertRuleDraft,
  createLinearNotificationRouteDraft,
  createSavedWebhookNotificationRouteDraft,
  getAlertRuleTemplate,
  normalizeNotificationEmails,
  normalizeQueueNames,
  serializeAlertRuleDraft,
  validateAlertRuleDraft,
  validateAlertRuleDraftFields,
} from '@/components/alerts/alert-rule-form'

describe('alert rule form helpers', () => {
  it('creates a stable default draft for new rules', () => {
    const draft = createAlertRuleDraft()

    expect(draft.type).toBe('failure_threshold')
    expect(draft.cooldownMinutes).toBe('30')
    expect(draft.queueFilterMode).toBe('include')
    expect(draft.selectedQueueNames).toEqual([])
    expect(draft.notificationRoutes).toHaveLength(1)
  })

  it('serializes include-mode draft into a single rule with filterQueueNames', () => {
    const payload = serializeAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Quality regression',
      queueFilterMode: 'include',
      selectedQueueNames: ['email-send'],
      type: 'failure_rate',
      failureRatePercent: '12.5',
      failureRateWindowMinutes: '30',
      failureRateMinSample: '250',
      notificationRoutes: [
        { id: 'route-1', type: 'email', target: 'ops@example.com' },
        { id: 'route-2', type: 'email', target: 'ops@example.com' },
        { id: 'route-3', type: 'email', target: 'platform@example.com' },
      ],
    })

    expect(payload).toEqual({
      name: 'Quality regression',
      queueName: null,
      queueFilterMode: 'include',
      filterQueueNames: ['email-send'],
      type: 'failure_rate',
      enabled: true,
      cooldownMinutes: 30,
      notificationChannels: [
        { type: 'email', target: 'ops@example.com' },
        { type: 'email', target: 'platform@example.com' },
      ],
      config: {
        rate: 0.125,
        windowMinutes: 30,
        minSample: 250,
      },
    })
  })

  it('stores multiple included queues in a single rule', () => {
    const payload = serializeAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Delivery spike',
      queueFilterMode: 'include',
      selectedQueueNames: ['email-send', 'invoice-send'],
    })

    expect(payload).toMatchObject({
      name: 'Delivery spike',
      queueFilterMode: 'include',
      filterQueueNames: ['email-send', 'invoice-send'],
    })
  })

  it('serializes exclude-mode draft with excluded queue names', () => {
    const payload = serializeAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Platform-wide spike',
      queueFilterMode: 'exclude',
      selectedQueueNames: ['debug-queue', 'test-queue'],
    })

    expect(payload).toMatchObject({
      name: 'Platform-wide spike',
      queueName: null,
      queueFilterMode: 'exclude',
      filterQueueNames: ['debug-queue', 'test-queue'],
    })
  })

  it('creates an all-queues rule when exclude mode has no exclusions', () => {
    const payload = serializeAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Catch all failures',
      queueFilterMode: 'exclude',
      selectedQueueNames: [],
    })

    expect(payload).toMatchObject({
      queueName: null,
      queueFilterMode: 'exclude',
      filterQueueNames: [],
    })
  })

  it('rejects include mode with no queues selected', () => {
    const error = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Empty include',
      queueFilterMode: 'include',
      selectedQueueNames: [],
    })

    expect(error).toContain('Choose at least one queue')
  })

  it('allows exclude mode with no queues selected', () => {
    const error = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'All queues via exclude',
      queueFilterMode: 'exclude',
      selectedQueueNames: [],
    })

    expect(error).toBeNull()
  })

  it('rejects malformed notification recipients', () => {
    const error = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Broken recipients',
      queueFilterMode: 'exclude',
      notificationRoutes: [{ id: 'route-1', type: 'email', target: 'not-an-email' }],
    })

    expect(error).toContain('Invalid notification email')
  })

  it('rejects a blank rule name', () => {
    const error = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: '   ',
      queueFilterMode: 'exclude',
    })

    expect(error).toBe('Rule name is required.')
  })

  it('rejects cooldown values outside the supported range', () => {
    const tooSmall = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Cooldown too small',
      queueFilterMode: 'exclude',
      cooldownMinutes: '0',
    })
    const notWholeNumber = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Cooldown not whole',
      queueFilterMode: 'exclude',
      cooldownMinutes: '12.5',
    })

    expect(tooSmall).toBe('Cooldown must be a whole number between 1 and 1440 minutes.')
    expect(notWholeNumber).toBe('Cooldown must be a whole number between 1 and 1440 minutes.')
  })

  it('rejects more than ten distinct notification emails', () => {
    const error = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Too many recipients',
      queueFilterMode: 'exclude',
      notificationRoutes: Array.from({ length: 11 }, (_, index) => ({
        id: `route-${index}`,
        type: 'email' as const,
        target: `ops-${index}@example.com`,
      })),
    })

    expect(error).toBe('You can configure up to 10 notification email recipients.')
  })

  it('rejects out-of-range failure threshold windows', () => {
    const error = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Failure spike',
      queueFilterMode: 'exclude',
      type: 'failure_threshold',
      failureThresholdCount: '20',
      failureThresholdWindowMinutes: '0',
    })

    expect(error).toBe('Failure threshold window must be between 1 and 1440 minutes.')
  })

  it('rejects out-of-range failure threshold counts', () => {
    const error = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Threshold count',
      queueFilterMode: 'exclude',
      type: 'failure_threshold',
      failureThresholdCount: '0',
      failureThresholdWindowMinutes: '5',
    })

    expect(error).toBe('Failure threshold count must be a whole number between 1 and 10000.')
  })

  it('rejects invalid failure rate settings', () => {
    const invalidPercent = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Invalid rate',
      queueFilterMode: 'exclude',
      type: 'failure_rate',
      failureRatePercent: '0',
      failureRateWindowMinutes: '15',
      failureRateMinSample: '100',
    })
    const invalidMinSample = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Invalid min sample',
      queueFilterMode: 'exclude',
      type: 'failure_rate',
      failureRatePercent: '12.5',
      failureRateWindowMinutes: '15',
      failureRateMinSample: '100001',
    })

    expect(invalidPercent).toBe('Failure rate must be between 1 and 100 percent.')
    expect(invalidMinSample).toBe('Minimum sample must be a whole number between 1 and 100000.')
  })

  it('rejects invalid stalled queue windows', () => {
    const error = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Stalled queue',
      queueFilterMode: 'exclude',
      type: 'queue_stalled',
      stalledMinutes: '1441',
    })

    expect(error).toBe('Stalled window must be a whole number between 1 and 1440 minutes.')
  })

  it('serializes stalled queue rules with the correct config shape', () => {
    const payload = serializeAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Workers stopped',
      queueFilterMode: 'exclude',
      type: 'queue_stalled',
      stalledMinutes: '12',
    })

    expect(payload).toMatchObject({
      type: 'queue_stalled',
      config: {
        stalledMinutes: 12,
      },
    })
  })

  it('serializes job failed rules and Linear notification routes', () => {
    const payload = serializeAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Create Linear issues',
      queueFilterMode: 'exclude',
      type: 'job_failed',
      jobFailedMaxIssuesPerPoll: '250',
      notificationRoutes: [
        createLinearNotificationRouteDraft(),
        { id: 'route-1', type: 'email', target: 'ops@example.com' },
      ],
    })

    expect(payload).toMatchObject({
      type: 'job_failed',
      config: {
        maxIssuesPerPoll: 250,
      },
      notificationChannels: [
        { type: 'email', target: 'ops@example.com' },
        { type: 'linear', target: 'org-default' },
      ],
    })
  })

  it('serializes saved webhook destination routes', () => {
    const payload = serializeAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Reusable webhook',
      queueFilterMode: 'exclude',
      notificationRoutes: [createSavedWebhookNotificationRouteDraft(1, 'destination-id')],
    })

    expect(payload.notificationChannels).toEqual([
      {
        type: 'webhook',
        destinationId: 'destination-id',
      },
    ])
  })

  it('requires a destination for saved webhook routes', () => {
    const error = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Missing destination',
      queueFilterMode: 'exclude',
      notificationRoutes: [createSavedWebhookNotificationRouteDraft(1, '')],
    })

    expect(error).toBe('Choose a saved webhook destination.')
  })

  it('serializes Linear priority zero as an explicit value', () => {
    const payload = serializeAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Create Linear issues',
      queueFilterMode: 'exclude',
      type: 'job_failed',
      notificationRoutes: [
        {
          ...createLinearNotificationRouteDraft(),
          priority: '0',
        },
      ],
    })

    expect(payload.notificationChannels).toEqual([
      { type: 'linear', target: 'org-default', priority: 0 },
    ])
  })

  it('trims blank Linear overrides before serialization', () => {
    const payload = serializeAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Create Linear issues',
      queueFilterMode: 'exclude',
      type: 'job_failed',
      notificationRoutes: [
        {
          ...createLinearNotificationRouteDraft(),
          teamId: '   ',
          projectId: ' project-1 ',
          labelIds: [' label-1 ', '  '],
          assigneeId: ' user-1 ',
          stateId: '',
        },
      ],
    })

    expect(payload.notificationChannels).toEqual([
      {
        type: 'linear',
        target: 'org-default',
        projectId: 'project-1',
        labelIds: ['label-1'],
        assigneeId: 'user-1',
      },
    ])
  })

  it('rejects non-whole Linear priority values', () => {
    const error = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Create Linear issues',
      queueFilterMode: 'exclude',
      type: 'job_failed',
      notificationRoutes: [
        {
          ...createLinearNotificationRouteDraft(),
          priority: '1.5',
        },
      ],
    })

    expect(error).toBe('Linear priority must be a whole number between 0 and 4.')
  })

  it('rejects out-of-range job failed poll caps', () => {
    const error = validateAlertRuleDraft({
      ...createAlertRuleDraft(),
      name: 'Too many issues',
      queueFilterMode: 'exclude',
      type: 'job_failed',
      jobFailedMaxIssuesPerPoll: '501',
    })

    expect(error).toBe('Max Linear issues per poll must be a whole number between 1 and 500.')
  })

  it('normalizes notification emails and queue names by trimming and deduping', () => {
    expect(
      normalizeNotificationEmails([
        ' ops@example.com ',
        '',
        'ops@example.com',
        'platform@example.com',
      ])
    ).toEqual(['ops@example.com', 'platform@example.com'])

    expect(normalizeQueueNames([' email-send ', 'email-send', '', 'sms-send'])).toEqual([
      'email-send',
      'sms-send',
    ])
  })

  it('hydrates draft from an existing exclude-mode rule', () => {
    const draft = createAlertRuleDraft({
      id: 'rule-1',
      organizationId: 'org-1',
      connectionId: 'conn-1',
      queueName: null,
      queueFilterMode: 'exclude',
      filterQueueNames: ['debug-queue'],
      name: 'Platform alert',
      type: 'failure_threshold',
      config: { count: 50, windowMinutes: 10 },
      enabled: true,
      notificationChannels: [{ type: 'email', target: 'ops@example.com' }],
      cooldownMinutes: 60,
      mutedUntil: null,
      state: 'active',
    })

    expect(draft.queueFilterMode).toBe('exclude')
    expect(draft.selectedQueueNames).toEqual(['debug-queue'])
  })

  it('hydrates draft from an existing include-mode rule', () => {
    const draft = createAlertRuleDraft({
      id: 'rule-2',
      organizationId: 'org-1',
      connectionId: 'conn-1',
      queueName: null,
      queueFilterMode: 'include',
      filterQueueNames: ['email-send', 'sms-send'],
      name: 'Delivery alerts',
      type: 'failure_rate',
      config: { rate: 0.1, windowMinutes: 15, minSample: 100 },
      enabled: true,
      notificationChannels: [],
      cooldownMinutes: 30,
      mutedUntil: null,
      state: 'active',
    })

    expect(draft.queueFilterMode).toBe('include')
    expect(draft.selectedQueueNames).toEqual(['email-send', 'sms-send'])
  })

  it('maps validation failures onto individual draft fields', () => {
    const errors = validateAlertRuleDraftFields({
      ...createAlertRuleDraft(),
      name: '',
      cooldownMinutes: '0',
      queueFilterMode: 'include',
      selectedQueueNames: [],
      failureThresholdCount: '0',
      notificationRoutes: [{ id: 'route-1', type: 'email', target: 'not-an-email' }],
    })

    expect(errors.name).toBe('Rule name is required.')
    expect(errors.cooldownMinutes).toBe(
      'Cooldown must be a whole number between 1 and 1440 minutes.'
    )
    expect(errors.queues).toContain('Choose at least one queue')
    expect(errors['route:route-1']).toBe('Invalid notification email: not-an-email')
    expect(errors.failureThresholdCount).toBe(
      'Failure threshold count must be a whole number between 1 and 10000.'
    )
  })

  it('returns an empty field-error map for a valid draft', () => {
    const errors = validateAlertRuleDraftFields({
      ...createAlertRuleDraft(),
      name: 'Valid rule',
      queueFilterMode: 'exclude',
    })

    expect(errors).toEqual({})
  })

  it('only validates the numeric fields of the active rule type', () => {
    const errors = validateAlertRuleDraftFields({
      ...createAlertRuleDraft(),
      name: 'Stalled watcher',
      queueFilterMode: 'exclude',
      type: 'queue_stalled',
      failureThresholdCount: '0',
      stalledMinutes: '10',
    })

    expect(errors).toEqual({})
  })

  it('hydrates draft from a legacy rule with only queueName', () => {
    const draft = createAlertRuleDraft({
      id: 'rule-3',
      organizationId: 'org-1',
      connectionId: 'conn-1',
      queueName: 'legacy-queue',
      queueFilterMode: null,
      filterQueueNames: [],
      name: 'Legacy alert',
      type: 'queue_stalled',
      config: { stalledMinutes: 10 },
      enabled: true,
      notificationChannels: [],
      cooldownMinutes: 30,
      mutedUntil: null,
      state: 'active',
    })

    expect(draft.queueFilterMode).toBe('include')
    expect(draft.selectedQueueNames).toEqual(['legacy-queue'])
  })
})

describe('buildSentenceTokens', () => {
  it('produces placeholder tokens for a fresh scratch draft', () => {
    const tokens = buildSentenceTokens(createAlertRuleDraft())
    const byKey = Object.fromEntries(tokens.map((token) => [token.key, token]))

    expect(tokens.map((token) => token.key)).toEqual(['queues', 'condition', 'routes', 'cooldown'])
    expect(byKey.queues).toMatchObject({
      label: 'choose queues',
      set: false,
      targetId: 'rule-panel-queues',
    })
    expect(byKey.condition).toMatchObject({
      label: '≥ 25 new failures within 5 min',
      set: true,
      invalid: false,
      targetId: 'rule-panel-condition',
    })
    expect(byKey.routes).toMatchObject({
      label: 'add destinations',
      set: false,
      targetId: 'rule-panel-notify',
    })
    expect(byKey.cooldown).toMatchObject({
      label: 'at most once every 30 min',
      set: true,
      invalid: false,
      targetId: 'rule-panel-advanced',
    })
  })

  it('summarizes queue coverage for both filter modes', () => {
    const base = createAlertRuleDraft()

    const allQueues = buildSentenceTokens({ ...base, queueFilterMode: 'exclude' })
    expect(allQueues[0]).toMatchObject({ label: 'all queues', set: true })

    const excludeTwo = buildSentenceTokens({
      ...base,
      queueFilterMode: 'exclude',
      selectedQueueNames: ['debug', 'test'],
    })
    expect(excludeTwo[0]).toMatchObject({ label: 'all queues except 2', set: true })

    const includeTwo = buildSentenceTokens({
      ...base,
      selectedQueueNames: ['email-send', 'sms-send'],
    })
    expect(includeTwo[0]).toMatchObject({ label: 'email-send, sms-send', set: true })

    const includeMany = buildSentenceTokens({
      ...base,
      selectedQueueNames: ['a', 'b', 'c'],
    })
    expect(includeMany[0]).toMatchObject({ label: '3 queues', set: true })
  })

  it('renders per-type condition fragments', () => {
    const base = { ...createAlertRuleDraft(), queueFilterMode: 'exclude' as const }

    expect(buildSentenceTokens({ ...base, type: 'failure_rate' })[1].label).toBe(
      'failure rate ≥ 10% over 15 min (min 100 jobs)'
    )
    expect(buildSentenceTokens({ ...base, type: 'queue_stalled' })[1].label).toBe(
      'no completions for 10 min while jobs wait'
    )
    expect(buildSentenceTokens({ ...base, type: 'job_failed' })[1].label).toBe(
      'any job failure (one Linear issue per job)'
    )
  })

  it('marks invalid condition values with the invalid flag', () => {
    const tokens = buildSentenceTokens({
      ...createAlertRuleDraft(),
      queueFilterMode: 'exclude',
      failureThresholdCount: '0',
    })

    expect(tokens[1]).toMatchObject({ invalid: true })
  })

  it('summarizes configured notification routes by channel', () => {
    const tokens = buildSentenceTokens({
      ...createAlertRuleDraft(),
      queueFilterMode: 'exclude',
      notificationRoutes: [
        { id: 'route-1', type: 'email', target: 'ops@example.com' },
        { id: 'route-2', type: 'email', target: 'platform@example.com' },
        createLinearNotificationRouteDraft(1),
        createSavedWebhookNotificationRouteDraft(1, 'destination-id'),
      ],
    })

    expect(tokens[2]).toMatchObject({
      label: '2 emails + Linear + 1 webhook',
      set: true,
      invalid: false,
    })
  })

  it('flags invalid routes on the routes token', () => {
    const tokens = buildSentenceTokens({
      ...createAlertRuleDraft(),
      queueFilterMode: 'exclude',
      notificationRoutes: [{ id: 'route-1', type: 'email', target: 'not-an-email' }],
    })

    expect(tokens[2]).toMatchObject({ invalid: true })
  })
})

describe('ALERT_RULE_TEMPLATES', () => {
  it('exposes the four canonical templates', () => {
    expect(ALERT_RULE_TEMPLATES.map((template) => template.key)).toEqual([
      'failure-spike',
      'error-rate',
      'stalled',
      'linear-triage',
    ])
    expect(getAlertRuleTemplate('error-rate')?.name).toBe('Elevated error rate')
    expect(getAlertRuleTemplate('unknown')).toBeNull()
    expect(getAlertRuleTemplate(undefined)).toBeNull()
  })

  it('applies the failure spike template defaults', () => {
    const draft = getAlertRuleTemplate('failure-spike')!.apply(createAlertRuleDraft())

    expect(draft).toMatchObject({
      type: 'failure_threshold',
      failureThresholdCount: '25',
      failureThresholdWindowMinutes: '5',
      cooldownMinutes: '30',
      queueFilterMode: 'exclude',
      selectedQueueNames: [],
    })
  })

  it('applies the elevated error rate template defaults', () => {
    const draft = getAlertRuleTemplate('error-rate')!.apply(createAlertRuleDraft())

    expect(draft).toMatchObject({
      type: 'failure_rate',
      failureRatePercent: '10',
      failureRateWindowMinutes: '15',
      failureRateMinSample: '250',
      cooldownMinutes: '60',
      queueFilterMode: 'exclude',
    })
  })

  it('applies the queue stalled template defaults', () => {
    const draft = getAlertRuleTemplate('stalled')!.apply(createAlertRuleDraft())

    expect(draft).toMatchObject({
      type: 'queue_stalled',
      stalledMinutes: '10',
      cooldownMinutes: '30',
      queueFilterMode: 'exclude',
    })
  })

  it('pre-adds a Linear route in the triage template only when the integration is valid', () => {
    const template = getAlertRuleTemplate('linear-triage')!

    const withLinear = template.apply(createAlertRuleDraft(), { linearIntegrationValid: true })
    expect(withLinear).toMatchObject({
      type: 'job_failed',
      jobFailedMaxIssuesPerPoll: '100',
      cooldownMinutes: '30',
      queueFilterMode: 'exclude',
    })
    expect(withLinear.notificationRoutes).toHaveLength(1)
    expect(withLinear.notificationRoutes[0].type).toBe('linear')

    const withoutLinear = template.apply(createAlertRuleDraft(), {
      linearIntegrationValid: false,
    })
    expect(withoutLinear.notificationRoutes.some((route) => route.type === 'linear')).toBe(false)
  })
})
