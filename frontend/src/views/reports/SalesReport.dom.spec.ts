// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SalesReport from './SalesReport.vue'

const h = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/index', () => ({ api: h }))

const salesData = (from: string, to: string) => ({
  from,
  to,
  asOf: '2026-11-01T12:00:00.000Z',
  kpis: { activeSales: 0, totalSales: 1, avgSentPerSale: 0, avgResponseMin: null, avgCloseRate: null },
  sales: [{
    userId: 'sale-a', name: 'Sale A', deptName: 'Team A', contacts: 0, sent: 0,
    avgResponseMin: null, apptDone: 0, apptNoShow: 0, closed: null, leadPoolUsed: 0, score: null,
  }],
  byDept: [{ deptName: 'Team A', contacts: 0, sent: 0, closed: null, closeRate: null }],
  responseBuckets: null,
  sentUnattributed: 0,
})

const usageData = (from: string, to: string) => ({
  from,
  to,
  kpis: { activeSalesToday: 0, avgActiveMinPerDay: null, totalActions: 0, topModule: '—' },
  bySale: [],
  moduleUsage: [],
  note: '',
  dailySeries: [],
  days: [],
  hourHeat: { max: 0, cells: [] },
  funnel: [],
  compare: [],
  availability: { outcomes: { status: 'unavailable', reason: 'won_status_mapping_unavailable' } },
})

const response = (path: string, from: string, to: string) => ({
  data: path === '/reports/sales-performance' ? salesData(from, to) : usageData(from, to),
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-01T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Sales report availability and loading states', () => {
  it('opens scoped row detail without extra API calls; close and period changes dismiss it', async () => {
    h.get.mockImplementation((path: string, config: any) => Promise.resolve(response(path, config.params.from, config.params.to)))
    const wrapper = mount(SalesReport, { global: { stubs: { VIcon: true, VDialog: { props: ['modelValue'], template: '<div v-if="modelValue" role="dialog"><slot /></div>' } } } })
    await flushPromises()
    await wrapper.get('button[aria-label="Chi tiết Sale A"]').trigger('click')
    expect(wrapper.get('[role="dialog"]').text()).toContain('Chưa có dữ liệu')
    expect(wrapper.get('[role="dialog"] dd').text()).toBe('Team A')
    expect(h.get).toHaveBeenCalledTimes(2)
    await wrapper.get('button[aria-label="Đóng chi tiết"]').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await wrapper.get('button[aria-label="Chi tiết Sale A"]').trigger('click')
    await wrapper.findAll('.seg button')[0].trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(h.get).toHaveBeenCalledTimes(4)
    wrapper.unmount()
  })
  it('does not present alphabetical CRM activity rows as an efficiency ranking', async () => {
    h.get.mockImplementation((path: string) => Promise.resolve(path === '/reports/sales-performance'
      ? response(path, '2026-10-03', '2026-11-01')
      : { data: { ...usageData('2026-10-03', '2026-11-01'), bySale: [{
        userId: 'sale-a', name: 'Sale A', deptName: 'Team A', avgActiveMinPerDay: 15,
        actions: 3, topModule: 'Khách hàng', closesPerHour: null, effScore: null,
      }] } }))
    const wrapper = mount(SalesReport, { global: { stubs: { VIcon: true } } })
    await flushPromises()
    const card = wrapper.findAll('.card').find(item => item.text().includes('Hoạt động dùng CRM theo Sale'))!
    expect(card.text()).toContain('Thời gian ước tính')
    expect(card.findAll('th').map(item => item.text())).not.toContain('#')
    expect(card.find('tbody tr').attributes('style')).toBeUndefined()
    expect(card.text()).not.toContain('Xếp hạng')
    wrapper.unmount()
  })
  it('distinguishes measured zero from unavailable metrics', async () => {
    h.get.mockImplementation((path: string) => Promise.resolve(response(path, '2026-10-03', '2026-11-01')))
    const wrapper = mount(SalesReport, { global: { stubs: { VIcon: true } } })
    await flushPromises()

    expect(wrapper.text()).toContain('Chưa có dữ liệu')
    expect(wrapper.text()).toContain('0')
    expect(wrapper.text()).toContain('Chưa thể tính hiệu quả/chốt')
    expect(wrapper.text()).not.toContain('0 phút')
  })

  it('shows a retryable error instead of stale results after request failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    h.get.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(SalesReport, { global: { stubs: { VIcon: true } } })
    await flushPromises()
    expect(wrapper.text()).toContain('Không tải được báo cáo hiệu suất Sale')
    expect(wrapper.find('[role="alert"] button').text()).toBe('Thử lại')

    h.get.mockImplementation((path: string) => Promise.resolve(response(path, '2026-10-03', '2026-11-01')))
    await wrapper.find('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Số liệu theo Sale')
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('ignores a slower response for an older selected period', async () => {
    let resolveOld!: (value: ReturnType<typeof response>) => void
    let call = 0
    h.get.mockImplementation((path: string) => {
      call++
      if (call === 1) return new Promise((resolve) => { resolveOld = (value) => resolve(value) })
      if (call === 2) return new Promise(() => undefined)
      return Promise.resolve(response(path, '2026-10-26', '2026-11-01'))
    })
    const wrapper = mount(SalesReport, { global: { stubs: { VIcon: true } } })

    await wrapper.findAll('.rpt-filters .seg button')[0].trigger('click')
    await flushPromises()
    expect(h.get).toHaveBeenCalledWith('/reports/sales-performance', {
      params: { from: '2026-10-26', to: '2026-11-01' },
    })

    resolveOld(response('/reports/sales-performance', '2026-10-03', '2026-11-01'))
    await flushPromises()
    expect(wrapper.text()).toContain('7 ngày')
    expect(wrapper.findAll('.card-h .meta').map((item) => item.text()).join(' ')).not.toContain('30 ngày')
  })
})
