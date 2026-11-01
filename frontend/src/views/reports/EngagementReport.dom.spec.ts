;;// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EngagementReport from './EngagementReport.vue'

const h = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/index', () => ({ api: h }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-01T12:00:00.000Z'))
  h.get.mockResolvedValue({
    data: {
      from: '2026-10-03',
      to: '2026-11-01',
      asOf: '2026-11-01T12:00:00.000Z',
      kpis: { hotCount: 0, coolingCount: 0, customerInitiatedPct: 0, avgInteractionsPerDay: 0 },
      heatmap: [],
      patternDist: [],
      cooling: [],
      hot: [],
      interactionTypes: { inbound: 0, outbound: 0, reaction: 0, voiceCall: 0 },
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Engagement report periods', () => {
  it('sends the selected Vietnam date range and keeps the heatmap window explicit', async () => {
    const wrapper = mount(EngagementReport)
    await flushPromises()

    expect(h.get).toHaveBeenNthCalledWith(1, '/reports/engagement', {
      params: { from: '2026-10-03', to: '2026-11-01' },
    })
    expect(wrapper.text()).toContain('2026-10-03')
    expect(wrapper.text()).toContain('2026-11-01')
    expect(wrapper.text()).toContain('cửa sổ cố định 28 ngày UTC')

    await wrapper.findAll('.rpt-filters .seg button')[0].trigger('click')
    await flushPromises()

    expect(h.get).toHaveBeenNthCalledWith(2, '/reports/engagement', {
      params: { from: '2026-11-01', to: '2026-11-01' },
    })
  })

  it('renders unavailable metrics distinctly from measured zero', async () => {
    h.get.mockResolvedValueOnce({
      data: {
        from: '2026-10-03',
        to: '2026-11-01',
        asOf: '2026-11-01T12:00:00.000Z',
        kpis: { hotCount: 0, coolingCount: 0, customerInitiatedPct: null, avgInteractionsPerDay: null },
        heatmap: [],
        patternDist: [],
        cooling: [],
        hot: [],
        interactionTypes: { inbound: 0, outbound: 0, reaction: 0, voiceCall: 0 },
      },
    })
    const wrapper = mount(EngagementReport)
    await flushPromises()

    const kpis = wrapper.findAll('.kpi')
    expect(kpis[0].text()).toContain('0')
    expect(kpis[2].text()).toContain('Chưa có dữ liệu')
    expect(kpis[2].text()).not.toContain('0%')
    expect(kpis[3].text()).toContain('Chưa có dữ liệu')
  })

  it('hides the previous period while loading and rejects a mismatched period response', async () => {
    const wrapper = mount(EngagementReport)
    await flushPromises()
    let resolve!: (value: unknown) => void
    h.get.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await wrapper.findAll('.rpt-filters .seg button')[0].trigger('click')
    expect(wrapper.findAll('.kpi')).toHaveLength(0)
    expect(wrapper.text()).toContain('Đang tải báo cáo tương tác')
    resolve({ data: { from: '2026-10-03', to: '2026-11-01' } })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Không tải được báo cáo tương tác')
    expect(wrapper.findAll('.kpi')).toHaveLength(0)
    wrapper.unmount()
  })

  it('shows API errors and retries successfully', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    h.get.mockRejectedValueOnce(new Error('503 fixture error'))
    const wrapper = mount(EngagementReport)
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Không tải được báo cáo tương tác')
    expect(wrapper.text()).not.toContain('Chưa có dữ liệu tương tác cho kỳ này.')

    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()

    expect(h.get).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Chỉ số tổng hợp:')
  })
})
