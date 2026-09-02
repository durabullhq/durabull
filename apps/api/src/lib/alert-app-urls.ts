export function buildAlertAppUrls({
  appBaseUrl,
  organizationSlug,
  connectionId,
  queueName,
  alertRuleId,
  jobId,
  connectionWide = false,
}: {
  appBaseUrl: string
  organizationSlug: string | null
  connectionId: string
  queueName: string
  alertRuleId: string
  jobId?: string | null
  connectionWide?: boolean
}): { dashboardUrl: string; muteUrl: string; jobUrl: string } {
  const baseUrl = appBaseUrl.replace(/\/+$/, '')

  if (!organizationSlug) {
    console.warn('[alert-app-urls] Missing organization slug for alert links')
    return {
      dashboardUrl: baseUrl,
      muteUrl: baseUrl,
      jobUrl: baseUrl,
    }
  }

  const orgSegment = encodeURIComponent(organizationSlug)
  const connectionSegment = encodeURIComponent(connectionId)
  const queueSegment = encodeURIComponent(queueName)
  const ruleQuery = new URLSearchParams({ ruleId: alertRuleId }).toString()
  const alertsUrl = `${baseUrl}/${orgSegment}/c/${connectionSegment}/alerts`

  if (connectionWide) {
    return {
      dashboardUrl: alertsUrl,
      jobUrl: alertsUrl,
      muteUrl: `${alertsUrl}?${ruleQuery}`,
    }
  }

  return {
    dashboardUrl: `${baseUrl}/${orgSegment}/c/${connectionSegment}/queues/${queueSegment}`,
    jobUrl: jobId
      ? `${baseUrl}/${orgSegment}/c/${connectionSegment}/queues/${queueSegment}/jobs/${encodeURIComponent(jobId)}`
      : `${baseUrl}/${orgSegment}/c/${connectionSegment}/queues/${queueSegment}`,
    muteUrl: `${alertsUrl}?${ruleQuery}`,
  }
}
