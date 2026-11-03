/** Navigation only. Backend resolves current membership and scope per request. */
export function canViewReports(user: { role: string; deptRole?: string | null; grants?: Record<string, Record<string, boolean>> } | null): boolean {
  if (!user) return false
  if (user.role === 'owner' || user.role === 'admin') return true
  return ['leader', 'deputy'].includes(user.deptRole ?? '') && user.grants?.engagement_score?.access === true
}

// AI uses the same initial report rollout policy; settings access is independent.
export const canViewAiReport = canViewReports

// All nine core routes are registered in both editions.
export const reportCategories = [
  { to: '/reports/tong-quan', icon: 'mdi-view-dashboard-outline', label: 'Tổng quan', title: 'Tổng quan điều hành' },
  { to: '/reports/nick', icon: 'mdi-cellphone-link', label: 'Nick Zalo', title: 'Vận hành Nick Zalo' },
  { to: '/reports/sale', icon: 'mdi-account-tie-outline', label: 'Sale & Team', title: 'Hiệu suất Sale & Team' },
  { to: '/reports/pipeline', icon: 'mdi-filter-variant', label: 'Pipeline & Lead Pool', title: 'Pipeline & Lead Pool' },
  { to: '/reports/automation', icon: 'mdi-cog-sync-outline', label: 'Automation', title: 'Automation & Chăm sóc', adminOnly: true },
  { to: '/reports/broadcast', icon: 'mdi-bullhorn-outline', label: 'Broadcast', title: 'Broadcast tự động', adminOnly: true },
  { to: '/reports/engagement', icon: 'mdi-fire', label: 'Engagement', title: 'Engagement khách hàng' },
  { to: '/reports/audit', icon: 'mdi-shield-check-outline', label: 'Audit & Hệ thống', title: 'Audit & Sức khỏe hệ thống', adminOnly: true },
  { to: '/reports/ai', icon: 'mdi-robot-outline', label: 'AI', title: 'Báo cáo AI' },
] as const

export function visibleReportCategories(user: Parameters<typeof canViewReports>[0]) {
  if (!canViewReports(user)) return []
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  return reportCategories.filter(category => !('adminOnly' in category) || isAdmin)
}

export function canViewReportPath(user: Parameters<typeof canViewReports>[0], path: string): boolean {
  return visibleReportCategories(user).some(category => category.to === path)
}
