// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReportsView from './ReportsView.vue'

const h = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api', () => ({ api: h }))

const stubs = {
  VSpacer: true,
  VTextField: { props: ['modelValue', 'label'], emits: ['update:modelValue'], template: '<input :aria-label="label" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  VBtn: { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  VTabs: { template: '<div><slot /></div>' },
  VTab: { template: '<span><slot /></span>' },
  VWindow: { template: '<div><slot /></div>' },
  VWindowItem: { props: ['value'], template: '<section :data-tab="value"><slot /></section>' },
  VAlert: { template: '<div role="alert"><slot /><slot name="append" /></div>' },
  VDataTable: {
    props: ['items', 'noDataText'],
    template: '<table><tr v-for="(row, i) in items" :key="i"><td v-for="(v, k) in row" :key="k">{{ v }}</td></tr><tr v-if="!items.length"><td class="empty">{{ noDataText }}</td></tr></table>',
  },
}
const deferred = <T,>() => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const messages = (from: string, to: string, sent: number) => ({ data: { from, to, data: [{ date: to, sent, received: 0, total: sent }] } })
// Snapshot includes contacts created outside the requested period; never add it to newPerDay.
const contacts = (from: string, to: string, newCount = 2, currentCount = 9) => ({ data: {
  from, to,
  newPerDay: [{ date: to, count: newCount }],
  byStatus: [{ status: 'new', count: currentCount }, { status: 'won', count: 0 }],
} })

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  // 01:30 on 02/11 in Vietnam, still 01/11 in UTC.
  vi.setSystemTime(new Date('2026-11-01T18:30:00.000Z'))
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('Basic reports page (/reports-co-ban)', () => {
  it('defaults to the last 30 Vietnam days including today, even between 00:00 and 06:59 VN', async () => {
    h.get.mockResolvedValue(messages('2026-10-04', '2026-11-02', 0))
    const wrapper = mount(ReportsView, { global: { stubs } })
    await flushPromises()
    expect(h.get).toHaveBeenCalledWith('/reports/messages', { params: { from: '2026-10-04', to: '2026-11-02' } })
    expect(wrapper.text()).toContain('Kỳ dữ liệu: 2026-10-04 – 2026-11-02')
    // A measured zero is shown as 0, not as "no data".
    expect(wrapper.find('section[data-tab="messages"] td').text()).toBe('2026-11-02')
    expect(wrapper.find('section[data-tab="messages"]').text()).toContain('0')
  })

  it('renders contact byStatus from the real payload', async () => {
    h.get.mockResolvedValueOnce(messages('2026-10-04', '2026-11-02', 1))
    h.get.mockResolvedValueOnce({ data: { from: '2026-10-04', to: '2026-11-02', newPerDay: [{ date: '2026-11-02', count: 2 }], byStatus: [{ status: 'new', count: 3 }, { status: 'won', count: 1 }] } })
    const wrapper = mount(ReportsView, { global: { stubs } })
    await flushPromises()
    ;(wrapper.vm as any).tab = 'contacts'
    await flushPromises()
    const text = wrapper.find('section[data-tab="contacts"]').text()
    expect(text).toContain('Mới 2026-11-02')
    expect(text).toContain('Trạng thái: new3')
    expect(text).toContain('Trạng thái: won1')
    // Status rows come before the per-day list so they are visible on the first page.
    expect(text.indexOf('Trạng thái: new')).toBeLessThan(text.indexOf('Mới 2026-11-02'))
  })

  it('a 503 clears the old rows, shows an alert and retry recovers', async () => {
    h.get.mockResolvedValueOnce(messages('2026-10-04', '2026-11-02', 7))
    const wrapper = mount(ReportsView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('section[data-tab="messages"]').text()).toContain('7')
    h.get.mockRejectedValueOnce({ response: { status: 503 } })
    await wrapper.findAll('button').find(b => b.text() === 'Xem')!.trigger('click')
    await flushPromises()
    const alert = wrapper.find('[role="alert"]')
    expect(alert.text()).toContain('Không tải được dữ liệu báo cáo')
    expect(wrapper.find('section[data-tab="messages"]').text()).not.toContain('7')
    expect(wrapper.find('section[data-tab="messages"] .empty').text()).toBe('Chưa tải được dữ liệu')
    expect(wrapper.text()).not.toContain('Kỳ dữ liệu:')
    h.get.mockResolvedValueOnce(messages('2026-10-04', '2026-11-02', 9))
    await alert.findAll('button').find(b => b.text() === 'Thử lại')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('section[data-tab="messages"]').text()).toContain('9')
  })

  it('a late response for an older period never overwrites the newer selection', async () => {
    h.get.mockResolvedValueOnce(messages('2026-10-04', '2026-11-02', 1))
    const wrapper = mount(ReportsView, { global: { stubs } })
    await flushPromises()
    const slow = deferred<unknown>()
    h.get.mockReturnValueOnce(slow.promise)
    await wrapper.find('input[aria-label="Từ ngày"]').setValue('2026-10-01')
    await wrapper.findAll('button').find(b => b.text() === 'Xem')!.trigger('click')
    h.get.mockResolvedValueOnce(messages('2026-11-02', '2026-11-02', 5))
    await wrapper.find('input[aria-label="Từ ngày"]').setValue('2026-11-02')
    await wrapper.findAll('button').find(b => b.text() === 'Xem')!.trigger('click')
    await flushPromises()
    slow.resolve(messages('2026-10-01', '2026-11-02', 99))
    await flushPromises()
    expect(wrapper.text()).toContain('Kỳ dữ liệu: 2026-11-02 – 2026-11-02')
    expect(wrapper.find('section[data-tab="messages"]').text()).toContain('5')
    expect(wrapper.find('section[data-tab="messages"]').text()).not.toContain('99')
  })

  it('switching tab quickly ignores the late response of the previous tab', async () => {
    const slow = deferred<unknown>()
    h.get.mockReturnValueOnce(slow.promise)
    h.get.mockResolvedValueOnce({ data: { from: '2026-10-04', to: '2026-11-02', byStatus: [{ status: 'completed', count: 2 }], byType: [] } })
    const wrapper = mount(ReportsView, { global: { stubs } })
    ;(wrapper.vm as any).tab = 'appointments'
    await flushPromises()
    slow.resolve(messages('2026-10-04', '2026-11-02', 42))
    await flushPromises()
    expect(wrapper.find('section[data-tab="appointments"]').text()).toContain('Trạng thái: completed2')
    expect(wrapper.find('section[data-tab="messages"]').text()).not.toContain('42')
    expect((wrapper.vm as any).loading).toBe(false)
  })

  it('marks the shown period as outdated when the inputs change without reloading', async () => {
    h.get.mockResolvedValueOnce(messages('2026-10-04', '2026-11-02', 1))
    const wrapper = mount(ReportsView, { global: { stubs } })
    await flushPromises()
    await wrapper.find('input[aria-label="Đến ngày"]').setValue('2026-11-01')
    expect(wrapper.text()).toContain('Kỳ dữ liệu: 2026-10-04 – 2026-11-02')
    expect(wrapper.text()).toContain('Khoảng ngày đã đổi')
  })

  it('an export failure is reported and the request carries the selected period', async () => {
    h.get.mockResolvedValueOnce(messages('2026-10-04', '2026-11-02', 1))
    const wrapper = mount(ReportsView, { global: { stubs } })
    await flushPromises()
    h.get.mockRejectedValueOnce({ response: { status: 503 } })
    await wrapper.findAll('button').find(b => b.text() === 'Xuất Excel')!.trigger('click')
    await flushPromises()
    expect(h.get).toHaveBeenLastCalledWith('/reports/export', { params: { type: 'messages', from: '2026-10-04', to: '2026-11-02' }, responseType: 'blob' })
    expect(wrapper.text()).toContain('Không xuất được file Excel')
  })

  it('an invalid date range gets a specific message', async () => {
    h.get.mockRejectedValueOnce({ response: { status: 400, data: { code: 'invalid_report_date_range' } } })
    const wrapper = mount(ReportsView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('Khoảng ngày không hợp lệ')
  })

  it('separates the current status snapshot from new customers in the period and preserves zero', async () => {
    h.get.mockResolvedValueOnce(messages('2026-10-04', '2026-11-02', 1))
    h.get.mockResolvedValueOnce(contacts('2026-10-04', '2026-11-02'))
    const wrapper = mount(ReportsView, { global: { stubs } })
    await flushPromises()
    ;(wrapper.vm as any).tab = 'contacts'
    await flushPromises()

    const snapshot = wrapper.find('section[aria-labelledby="basic-report-contact-status-title"]')
    const period = wrapper.find('section[aria-labelledby="basic-report-contact-new-title"]')
    expect(snapshot.exists()).toBe(true)
    expect(period.exists()).toBe(true)
    expect(snapshot.find('h2').text()).toBe('Trạng thái hiện tại — không giới hạn theo kỳ')
    expect(snapshot.findAll('tr').map(row => row.text())).toEqual(['Trạng thái: new9', 'Trạng thái: won0'])
    expect(snapshot.text()).not.toContain('2026-10-04')
    expect(snapshot.text()).not.toContain('Mới 2026-11-02')
    expect(period.find('h2').text()).toBe('Khách mới trong kỳ')
    expect(period.text()).toContain('Kỳ dữ liệu: 2026-10-04 – 2026-11-02')
    expect(period.findAll('tr').map(row => row.text())).toEqual(['Mới 2026-11-022'])
    expect(period.text()).not.toContain('Trạng thái:')
    // The period label belongs to the period group, never above the mixed customer view.
    expect(wrapper.findAll('.report-period')).toHaveLength(1)
    expect(period.find('.report-period').exists()).toBe(true)
  })

  it('keeps snapshot semantics and the last successful period when date inputs change', async () => {
    h.get.mockResolvedValueOnce(messages('2026-10-04', '2026-11-02', 1))
    h.get.mockResolvedValueOnce(contacts('2026-10-04', '2026-11-02'))
    const wrapper = mount(ReportsView, { global: { stubs } })
    await flushPromises()
    ;(wrapper.vm as any).tab = 'contacts'
    await flushPromises()
    await wrapper.find('input[aria-label="Từ ngày"]').setValue('2026-11-01')
    await wrapper.find('input[aria-label="Đến ngày"]').setValue('2026-11-01')
    const snapshot = wrapper.find('section[aria-labelledby="basic-report-contact-status-title"]')
    const period = wrapper.find('section[aria-labelledby="basic-report-contact-new-title"]')
    expect(snapshot.text()).toContain('Trạng thái hiện tại — không giới hạn theo kỳ')
    expect(period.text()).toContain('Kỳ dữ liệu: 2026-10-04 – 2026-11-02')
    expect(period.text()).toContain('Khoảng ngày đã đổi')
    expect(period.find('.report-period').text()).not.toContain('2026-11-01')

    const next = deferred<unknown>()
    h.get.mockReturnValueOnce(next.promise)
    await wrapper.findAll('button').find(b => b.text() === 'Xem')!.trigger('click')
    await flushPromises()
    expect(snapshot.findAll('tr').map(row => row.text())).toEqual(['Đang tải dữ liệu…'])
    expect(period.findAll('tr').map(row => row.text())).toEqual(['Đang tải dữ liệu…'])
    expect(period.find('.report-period').exists()).toBe(false)
    next.resolve(contacts('2026-11-01', '2026-11-01', 0))
    await flushPromises()
    expect(snapshot.text()).toContain('Trạng thái hiện tại — không giới hạn theo kỳ')
    expect(snapshot.findAll('tr').map(row => row.text())).toEqual(['Trạng thái: new9', 'Trạng thái: won0'])
    expect(period.text()).toContain('Kỳ dữ liệu: 2026-11-01 – 2026-11-01')
    expect(period.findAll('tr').map(row => row.text())).toEqual(['Mới 2026-11-010'])
    expect(period.text()).not.toContain('Khoảng ngày đã đổi')
  })

  it('clears both customer groups on failure and restores them on retry without treating error as empty data', async () => {
    h.get.mockResolvedValueOnce(messages('2026-10-04', '2026-11-02', 1))
    h.get.mockResolvedValueOnce(contacts('2026-10-04', '2026-11-02'))
    const wrapper = mount(ReportsView, { global: { stubs } })
    await flushPromises()
    ;(wrapper.vm as any).tab = 'contacts'
    await flushPromises()
    h.get.mockRejectedValueOnce({ response: { status: 503 } })
    await wrapper.findAll('button').find(b => b.text() === 'Xem')!.trigger('click')
    await flushPromises()
    const snapshot = wrapper.find('section[aria-labelledby="basic-report-contact-status-title"]')
    const period = wrapper.find('section[aria-labelledby="basic-report-contact-new-title"]')
    expect(wrapper.find('[role="alert"]').text()).toContain('Không tải được dữ liệu báo cáo')
    expect(snapshot.findAll('tr').map(row => row.text())).toEqual(['Chưa tải được dữ liệu'])
    expect(period.findAll('tr').map(row => row.text())).toEqual(['Chưa tải được dữ liệu'])
    expect(period.find('.report-period').exists()).toBe(false)
    h.get.mockResolvedValueOnce({ data: { from: '2026-10-04', to: '2026-11-02', byStatus: [], newPerDay: [] } })
    await wrapper.find('[role="alert"]').findAll('button').find(b => b.text() === 'Thử lại')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(snapshot.find('.empty').text()).toBe('Không có dữ liệu trạng thái hiện tại')
    expect(period.find('.empty').text()).toBe('Không có dữ liệu trong kỳ')
    expect(period.text()).toContain('Kỳ dữ liệu: 2026-10-04 – 2026-11-02')
  })

  it('ignores a late contacts response for both groups after returning with a newer period', async () => {
    const slow = deferred<unknown>()
    h.get.mockResolvedValueOnce(messages('2026-10-04', '2026-11-02', 1))
    h.get.mockReturnValueOnce(slow.promise)
    h.get.mockResolvedValueOnce(messages('2026-11-01', '2026-11-01', 3))
    h.get.mockResolvedValueOnce(contacts('2026-11-01', '2026-11-01', 0, 4))
    const wrapper = mount(ReportsView, { global: { stubs } })
    await flushPromises()
    ;(wrapper.vm as any).tab = 'contacts'
    await flushPromises()
    await wrapper.find('input[aria-label="Từ ngày"]').setValue('2026-11-01')
    await wrapper.find('input[aria-label="Đến ngày"]').setValue('2026-11-01')
    ;(wrapper.vm as any).tab = 'messages'
    await flushPromises()
    ;(wrapper.vm as any).tab = 'contacts'
    await flushPromises()
    slow.resolve(contacts('2026-10-04', '2026-11-02'))
    await flushPromises()
    const snapshot = wrapper.find('section[aria-labelledby="basic-report-contact-status-title"]')
    const period = wrapper.find('section[aria-labelledby="basic-report-contact-new-title"]')
    expect(snapshot.findAll('tr').map(row => row.text())).toEqual(['Trạng thái: new4', 'Trạng thái: won0'])
    expect(period.findAll('tr').map(row => row.text())).toEqual(['Mới 2026-11-010'])
    expect(period.text()).toContain('Kỳ dữ liệu: 2026-11-01 – 2026-11-01')
    expect(period.text()).not.toContain('2026-10-04')
    expect((wrapper.vm as any).loading).toBe(false)
  })
})
