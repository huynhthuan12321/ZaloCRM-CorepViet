// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PipelineReport from './PipelineReport.vue'

const h = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/index', () => ({ api: h }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-01T12:00:00.000Z'))
  h.get.mockImplementation((path: string) => Promise.resolve({
    data: {
      from: '2026-10-03',
      to: '2026-11-01',
      kpis: path.endsWith('pipeline')
        ? { closeRate: null, avgTimeInStageDays: null, leadPoolWaiting: 0 }
        : { waiting: 0, returnRate: null },
      funnel: [],
      timeInStage: [],
      bySource: [],
      byUser: [],
      stuck: [],
      availability: {
        returnRate: { status: 'unavailable', reason: 'lead_return_denominator_unavailable' },
      },
    },
  }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Pipeline report source availability', () => {
  it('does not promise source-to-close analysis when the source is unavailable', async () => {
    const wrapper = mount(PipelineReport, { global: { stubs: { VIcon: true } } })
    await flushPromises()

    expect(wrapper.text()).toContain('Chỉ số chốt và thời gian ở stage chưa có nguồn dữ liệu đủ tin cậy')
    expect(wrapper.text()).not.toContain('nguồn nào ra chốt tốt')
    expect(wrapper.text()).toContain('Mẫu số nghiệp vụ chưa được xác nhận')
    expect(wrapper.text()).toContain('Chưa có dữ liệu')
  })
})
