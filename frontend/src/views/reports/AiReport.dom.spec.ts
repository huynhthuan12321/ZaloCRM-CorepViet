// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AiReport from './AiReport.vue'
import ReportsShell from './ReportsShell.vue'
import type { AiReportData, AiReportSection } from '@/types/ai-report'
import { canViewAiReport } from '@/utils/report-access'

const h = vi.hoisted(() => ({ get: vi.fn(), user: { role: 'admin' } as any }))
vi.mock('@/api/index', () => ({ api: h }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => h }))
const emptySection = (sentMessages = 0): AiReportSection => ({
  kpis: { sentMessages, conversations: sentMessages ? 1 : 0, autoReplies: 0, followups: 0, unclassified: sentMessages, reviewDraftsCreated: 0 },
  series: [],
})
function payload(period: { from: string; to: string }, sentMessages = 0): { data: AiReportData } {
  return { data: {
    ...period, asOf: '2026-11-01T12:00:00Z', timeZone: 'Asia/Ho_Chi_Minh', scope: { kind: 'org', sharedAccounts: 0 },
    main: emptySection(sentMessages), shared: null,
    unavailable: { pendingReviews: null, cost: null, tokens: null, conversionRate: null, handoffRate: null },
    availability: {
      pendingReviews: { status: 'unavailable', reason: 'review_lifecycle_unavailable' },
      cost: { status: 'unavailable', reason: 'recorded_cost_unavailable' }, tokens: { status: 'unavailable', reason: 'token_usage_unavailable' },
      conversionRate: { status: 'unavailable', reason: 'conversion_events_unavailable' }, handoffRate: { status: 'unavailable', reason: 'handoff_events_unavailable' },
    },
  } }
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T12:00:00Z'))
  h.user = { role: 'admin' }
  h.get.mockImplementation(async (_path: string, { params }: any) => payload(params))
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('AI report UI', () => {
  it('keeps measured zero separate from unavailable sources and labels saved drafts honestly', async () => {
    const wrapper = mount(AiReport); await flushPromises()
    expect(wrapper.get('[data-metric="sentMessages"] .val').text()).toBe('0')
    expect(wrapper.text()).toContain('Nháp cần duyệt đã tạo')
    expect(wrapper.text()).toContain('không phải số đang chờ')
    expect(wrapper.get('section[aria-label="Chỉ số chưa đủ nguồn"]').text()).toContain('Chưa có dữ liệu')
    expect(wrapper.text()).not.toContain('0%'); expect(wrapper.text()).not.toContain('0 ₫')
    expect(h.get).toHaveBeenCalledWith('/reports/ai', expect.objectContaining({ params: { from: '2026-10-03', to: '2026-11-01' } }))
    wrapper.unmount()
  })
  it('renders shared account metrics separately without adding them to main', async () => {
    h.get.mockImplementationOnce(async (_path: string, { params }: any) => {
      const response = payload(params, 3); response.data.scope = { kind: 'department', sharedAccounts: 1 }; response.data.shared = emptySection(7); return response
    })
    const wrapper = mount(AiReport); await flushPromises()
    expect(wrapper.get('section[aria-label="KPI chính"] [data-metric="sentMessages"] .val').text()).toBe('3')
    expect(wrapper.get('section[aria-label="Nick được cấp thêm"] [data-metric="sentMessages"] .val').text()).toBe('7')
    expect(wrapper.text()).toContain('không cộng vào KPI chính')
    expect(wrapper.get('section[aria-label="KPI chính"] .ai-classification-note').text()).toContain('3 tin còn lại chưa phân loại')
    expect(wrapper.get('section[aria-label="Nick được cấp thêm"] .ai-classification-note').text()).toContain('7 tin còn lại chưa phân loại')
    wrapper.unmount()
  })
  it('clears old values while loading and ignores a late response from the previous period', async () => {
    const wrapper = mount(AiReport); await flushPromises()
    let resolveOld!: (value: unknown) => void
    h.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    await wrapper.get('.seg button').trigger('click')
    expect(wrapper.findAll('.kpi')).toHaveLength(0); expect(wrapper.text()).toContain('Đang tải báo cáo AI')
    h.get.mockImplementationOnce(async (_path: string, { params }: any) => payload(params, 7))
    await wrapper.findAll('.seg button')[1].trigger('click'); await flushPromises()
    resolveOld(payload({ from: '2026-11-01', to: '2026-11-01' }, 99)); await flushPromises()
    expect(wrapper.get('[data-metric="sentMessages"] .val').text()).toBe('7')
    expect(wrapper.findAll('.seg button')[1].attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })
  it('rejects mismatched response dates rather than showing wrong-period KPIs', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    h.get.mockResolvedValueOnce(payload({ from: '2026-10-01', to: '2026-10-01' }, 99))
    const wrapper = mount(AiReport); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Không tải được báo cáo AI')
    expect(wrapper.findAll('.kpi')).toHaveLength(0); wrapper.unmount()
  })
  it('distinguishes request failure from empty data and retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    h.get.mockRejectedValueOnce(new Error('503 local fixture'))
    const wrapper = mount(AiReport); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Thử lại')
    expect(wrapper.text()).not.toContain('Chưa ghi nhận tin AI')
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(wrapper.findAll('.kpi')).toHaveLength(6); expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('cancels its in-flight request when unmounted', async () => {
    h.get.mockImplementationOnce(() => new Promise(() => undefined))
    const wrapper = mount(AiReport)
    const signal = h.get.mock.calls[0][1].signal as AbortSignal
    wrapper.unmount(); expect(signal.aborted).toBe(true)
  })
  it('only adds the AI navigation tab for the current rollout roles', async () => {
    const { createRouter, createMemoryHistory } = await import('vue-router')
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/reports/tong-quan', component: { template: '<div />' } }] })
    await router.push('/reports/tong-quan')
    await router.isReady()
    const options = { global: { plugins: [router], stubs: { RouterView: true, RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' }, VIcon: true } } }
    h.user = { role: 'member', deptRole: 'member', grants: { engagement_score: { access: true } } }
    const member = mount(ReportsShell, options); expect(member.find('a[href="/reports/ai"]').exists()).toBe(false); member.unmount()
    h.user = { role: 'member', deptRole: 'leader', grants: { engagement_score: { access: true } } }
    const leader = mount(ReportsShell, options); expect(leader.find('a[href="/reports/ai"]').exists()).toBe(true); leader.unmount()
  })
  it.each([
    [{ role: 'owner' }, true], [{ role: 'admin' }, true],
    [{ role: 'member', deptRole: 'leader', grants: { engagement_score: { access: true } } }, true],
    [{ role: 'member', deptRole: 'deputy', grants: { engagement_score: { access: true } } }, true],
    [{ role: 'member', deptRole: 'leader', grants: { ai: { access: true } } }, false],
    [{ role: 'member', deptRole: 'member', grants: { engagement_score: { access: true } } }, false],
    [null, false],
  ] as const)('navigation capability follows reports policy for %j', (user, allowed) => {
    expect(canViewAiReport(user)).toBe(allowed)
  })
})
