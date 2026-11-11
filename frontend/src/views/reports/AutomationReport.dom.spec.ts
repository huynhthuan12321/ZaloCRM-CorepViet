// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AutomationReport from './AutomationReport.vue'

const h = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/index', () => ({ api: h }))

function payload(params: { from: string; to: string }, rates = { acceptance: null as number | null, reply: null as number | null }) {
  const bucket = {
    kbGui: 0, dongY: 0, tuChoi: 0, noZalo: 0, bdGui: 0, phanHoi: 0, reconnect: 0,
    tiLeDongYPct: rates.acceptance, tiLePhanHoiPct: rates.reply,
  }
  return {
    data: {
      ...params,
      kpis: { ...bucket, nickOnline: 0, tongNick: 0 },
      bySale: [{ ...bucket, userId: 'sale-a', saleName: 'Sale A' }],
      byNick: [{ ...bucket, zaloAccountId: 'nick-a', nickName: 'Nick A', ownerUserId: 'sale-a' }],
    },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-01T12:00:00.000Z'))
  h.get.mockImplementation(async (_path: string, { params }: any) => payload(params))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Automation report availability', () => {
  it('distinguishes unavailable rates from measured zero', async () => {
    const wrapper = mount(AutomationReport)
    await flushPromises()

    expect(wrapper.text()).toContain('0')
    expect(wrapper.text()).toContain('Chưa có dữ liệu')
    expect(wrapper.text()).not.toContain('0%')

    h.get.mockImplementationOnce(async (_path: string, { params }: any) => payload(params, { acceptance: 0, reply: 0 }))
    await wrapper.findAll('.rpt-filters .seg button')[0].trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('0%')
    wrapper.unmount()
  })

  it('shows request errors and retries successfully', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    h.get.mockRejectedValueOnce(new Error('503 fixture error'))
    const wrapper = mount(AutomationReport)
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Không tải được báo cáo Automation')
    expect(wrapper.text()).not.toContain('Chưa có dữ liệu trong khoảng thời gian này.')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(h.get).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('.kpi')).toHaveLength(8)
    wrapper.unmount()
  })

  it('rejects a response for a different selected period', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    h.get.mockImplementationOnce(async () => payload({ from: '2026-10-01', to: '2026-10-29' }))
    const wrapper = mount(AutomationReport)
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Không tải được báo cáo Automation')
    expect(wrapper.findAll('.kpi')).toHaveLength(0)
    wrapper.unmount()
  })

  it('ignores a late response from the previous range', async () => {
    let resolveOld!: () => void
    h.get.mockImplementationOnce((_path: string, { params }: any) => new Promise(resolve => {
      resolveOld = () => {
        const old = payload(params)
        old.data.kpis.kbGui = 99
        resolve(old)
      }
    }))
    const wrapper = mount(AutomationReport)
    await wrapper.findAll('.rpt-filters .seg button')[0].trigger('click')
    await flushPromises()
    expect(h.get).toHaveBeenCalledTimes(2)

    resolveOld()
    await flushPromises()
    expect(wrapper.findAll('.kpi')[0].text()).not.toContain('99')
    wrapper.unmount()
  })
})
