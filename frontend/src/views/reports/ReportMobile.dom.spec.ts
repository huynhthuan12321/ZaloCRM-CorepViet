// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ReportsShell from './ReportsShell.vue'
import ReportContext from './ReportContext.vue'
import ReportTable from './ReportTable.vue'
import ReportDetail from './ReportDetail.vue'
import BottomNav from '@/components/BottomNav.vue'
import { canViewReports, reportCategories, visibleReportCategories, canViewReportPath } from '@/utils/report-access'

const state = vi.hoisted(() => ({ auth: null as any }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => state.auth }))
const leader = () => ({ role: 'member', deptRole: 'leader', grants: { engagement_score: { access: true } } })

describe('report navigation and mobile display contracts', () => {
  beforeEach(() => { state.auth = reactive({ user: leader() }) })

  it.each([
    [null, false],
    [{ role: 'owner' }, true],
    [{ role: 'admin' }, true],
    [leader(), true],
    [{ ...leader(), deptRole: 'deputy' }, true],
    [{ ...leader(), deptRole: 'member' }, false],
    [{ role: 'member', deptRole: 'leader', grants: { ai: { access: true }, settings: { access: true } } }, false],
    [{ role: 'member', grants: { engagement_score: { access: true } } }, false],
  ])('matches initial backend rollout for viewer %j', (viewer, allowed) => {
    expect(canViewReports(viewer)).toBe(allowed)
  })

  it('keeps all eight original categories and AI without an edition-only menu gate', () => {
    expect(reportCategories.map(c => c.to)).toEqual([
      '/reports/tong-quan', '/reports/nick', '/reports/sale', '/reports/pipeline',
      '/reports/automation', '/reports/broadcast', '/reports/engagement', '/reports/audit', '/reports/ai',
    ])
  })

  it('preserves admin-only Automation/Broadcast/Audit backend capabilities in navigation', () => {
    expect(visibleReportCategories({ role: 'admin' })).toHaveLength(9)
    expect(visibleReportCategories(leader())).toHaveLength(6)
    for (const path of ['/reports/automation', '/reports/broadcast', '/reports/audit']) {
      expect(canViewReportPath(leader(), path)).toBe(false)
      expect(canViewReportPath({ role: 'admin' }, path)).toBe(true)
    }
  })

  async function shell() {
    const router = createRouter({ history: createMemoryHistory(), routes: reportCategories.map(c => ({ path: c.to, component: { template: '<div>report body</div>' } })) })
    await router.push('/reports/tong-quan')
    await router.isReady()
    const wrapper = mount(ReportsShell, { global: { plugins: [router], stubs: { VIcon: true } } })
    await flushPromises()
    return { wrapper, router }
  }

  it('native category selector navigates and tracks browser history, not an independent stale selection', async () => {
    const { wrapper, router } = await shell()
    expect(wrapper.findAll('select option')).toHaveLength(6)
    await wrapper.get('select').setValue('/reports/ai')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/reports/ai')
    await router.push('/reports/nick')
    await flushPromises()
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('/reports/nick')
    wrapper.unmount()
  })

  it('removes both desktop tabs and selector options after a membership downgrade', async () => {
    const { wrapper } = await shell()
    state.auth.user.deptRole = 'member'
    await flushPromises()
    expect(wrapper.findAll('select option')).toHaveLength(0)
    expect(wrapper.findAll('nav a')).toHaveLength(0)
    wrapper.unmount()
  })

  it('shows the actual response period and Vietnam asOf, with snapshot distinction', () => {
    const wrapper = mount(ReportContext, { props: { report: { from: '2026-11-01', to: '2026-11-01', asOf: '2026-11-01T17:05:00Z' }, snapshots: 'Khách phụ trách' } })
    expect(wrapper.text()).toContain('2026-11-01 – 2026-11-01')
    expect(wrapper.text()).toContain('00:05')
    expect(wrapper.text()).toContain('ảnh chụp hiện tại; không giới hạn theo kỳ')
  })

  it('never invents a server update timestamp when missing', () => {
    const wrapper = mount(ReportContext, { props: { report: { from: '2026-11-01', to: '2026-11-01' } } })
    expect(wrapper.text()).toContain('API chưa cung cấp thời điểm cập nhật')
    expect(wrapper.find('time').exists()).toBe(false)
  })

  it('table retains semantic content and a keyboard focusable region, including measured zero', () => {
    const wrapper = mount(ReportTable, { props: { label: 'Tin nhắn' }, slots: { default: '<table><tbody><tr><td>0</td></tr></tbody></table>' } })
    expect(wrapper.get('[role="region"]').attributes('tabindex')).toBe('0')
    expect(wrapper.get('td').text()).toBe('0')
    expect(wrapper.get('[role="region"]').attributes('aria-describedby')).toBe(wrapper.get('p').attributes('id'))
  })

  it('detail displays unavailable text and emits return without requesting data', async () => {
    const wrapper = mount(ReportDetail, { props: { open: true, title: 'VERIFY Sale', rows: [{ label: 'Chốt', value: 'Chưa có dữ liệu' }] }, global: { stubs: { VDialog: { template: '<div><slot /></div>' } } } })
    expect(wrapper.get('dd').text()).toBe('Chưa có dữ liệu')
    await wrapper.get('button.primary').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('mobile entry is a fifth Reports destination for allowed viewers and follows nested report routes', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/reports/ai', component: { template: '<div />' } }] })
    await router.push('/reports/ai')
    const wrapper = mount(BottomNav, { global: { plugins: [router], stubs: { VBottomNavigation: { props: ['modelValue'], template: '<nav :data-active="modelValue"><slot /></nav>' }, VBtn: { template: '<button><slot /></button>' }, VIcon: true } } })
    expect(wrapper.findAll('button')).toHaveLength(5)
    expect(wrapper.text()).toContain('Báo cáo')
    expect(wrapper.get('nav').attributes('data-active')).toBe('/reports/tong-quan')
    state.auth.user.deptRole = 'member'
    await flushPromises()
    expect(wrapper.findAll('button')).toHaveLength(4)
    expect(wrapper.text()).not.toContain('Báo cáo')
    wrapper.unmount()
  })
})
