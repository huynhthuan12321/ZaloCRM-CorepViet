// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NickFleetReport from './NickFleetReport.vue'

const h = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/index', () => ({ api: h }))

const report = (kpis: Record<string, number | null>) => ({
  data: {
    from: '2026-10-03',
    to: '2026-11-01',
    asOf: '2026-11-01T12:00:00.000Z',
    kpis: {
      total: 1,
      online: 1,
      needRelogin: 0,
      msgByBotToday: null,
      uptimeTeamAvg: null,
      friendAcceptAvg: null,
      sdkUsedAvgPct: null,
      phoneFoundPct: null,
      ...kpis,
    },
    availability: {},
    alerts: [],
    nicks: [{
      id: 'nick-a',
      name: 'Nick A',
      ownerName: 'Sale A',
      status: 'connected',
      uptime7d: null,
      msgUser: null,
      msgBot: null,
      friendSent: null,
      friendAcceptPct: null,
      sdkUsed: null,
      sdkCap: null,
      phoneFoundPct: null,
    }],
    uptimeHeat: [{ nickId: 'nick-a', name: 'Nick A', days: [null, null, null, null, null, null, null] }],
    sdkByCategory: null,
  },
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-01T12:00:00.000Z'))
  h.get.mockResolvedValue(report({}))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Nick Fleet unavailable values', () => {
  it('does not append percent signs or dashes to unavailable values', async () => {
    const wrapper = mount(NickFleetReport, { global: { stubs: { VIcon: true } } })
    await flushPromises()

    const kpis = wrapper.findAll('.kpi')
    for (const index of [4, 5, 6, 7]) {
      expect(kpis[index].text()).toContain('Chưa có dữ liệu')
      expect(kpis[index].text()).not.toContain('%')
    }

    const row = wrapper.find('tbody tr')
    expect(row.findAll('td')[4].text()).toContain('Chưa có dữ liệu')
    expect(row.findAll('td')[6].text()).toContain('Chưa có dữ liệu')
    expect(row.findAll('td')[4].text()).not.toBe('—')
    expect(row.findAll('td')[6].text()).not.toBe('—')
  })

  it('keeps a measured zero percent distinguishable from unavailable', async () => {
    h.get.mockResolvedValue(report({
      uptimeTeamAvg: 0,
      friendAcceptAvg: 0,
      sdkUsedAvgPct: 0,
      phoneFoundPct: 0,
    }))
    const wrapper = mount(NickFleetReport, { global: { stubs: { VIcon: true } } })
    await flushPromises()

    expect(wrapper.findAll('.kpi')[4].text()).toContain('0%')
    expect(wrapper.findAll('.kpi')[4].text()).not.toContain('Chưa có dữ liệu')
  })
})
