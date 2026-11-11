export interface AiReportKpis {
  sentMessages: number
  conversations: number
  // Confirmed subsets; unclassified messages keep full subtype totals unknown.
  autoReplies: number
  followups: number
  unclassified: number
  reviewDraftsCreated: number
}
export interface AiReportSection {
  kpis: AiReportKpis
  series: Array<{ date: string; sentMessages: number; autoReplies: number; followups: number; unclassified: number; reviewDraftsCreated: number }>
}
export type UnavailableAiMetric = 'pendingReviews' | 'tokens' | 'cost' | 'handoffRate' | 'conversionRate'
export interface AiReportData {
  from: string
  to: string
  asOf: string
  timeZone: string
  scope: { kind: 'org' | 'department'; sharedAccounts: number }
  main: AiReportSection
  shared: AiReportSection | null
  unavailable: Record<UnavailableAiMetric, null>
  availability: Record<UnavailableAiMetric, { status: 'unavailable'; reason: string }>
}
