export const METRICS_WINDOWS = [
  { label: '1H', value: '1h', minutes: 60 },
  { label: '6H', value: '6h', minutes: 360 },
  { label: '24H', value: '24h', minutes: 1440 },
  { label: '7D', value: '7d', minutes: 10080 },
  { label: '14D', value: '14d', minutes: 20160 },
  { label: '30D', value: '30d', minutes: 43200 },
] as const

export type AnalyticsWindowValue = (typeof METRICS_WINDOWS)[number]['value']
