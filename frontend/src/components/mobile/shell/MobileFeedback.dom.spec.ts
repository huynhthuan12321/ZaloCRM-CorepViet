// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MobileFeedback from './MobileFeedback.vue';

describe('MobileFeedback', () => {
  it('loading: role=status, aria-busy, có chữ cho trình đọc màn hình', () => {
    const w = mount(MobileFeedback, { props: { state: 'loading' } });
    expect(w.attributes('role')).toBe('status');
    expect(w.attributes('aria-busy')).toBe('true');
    expect(w.text()).toContain('Đang tải');
  });

  it('error: role=alert, nút Thử lại phát retry', async () => {
    const w = mount(MobileFeedback, { props: { state: 'error', retryable: true } });
    expect(w.attributes('role')).toBe('alert');
    await w.get('button').trigger('click');
    expect(w.emitted('retry')).toHaveLength(1);
  });

  it('error không retryable -> không có nút', () => {
    const w = mount(MobileFeedback, { props: { state: 'error' } });
    expect(w.find('button').exists()).toBe(false);
  });

  it('empty + clearable: nút Xóa bộ lọc; empty không hiện Thử lại', async () => {
    const w = mount(MobileFeedback, { props: { state: 'empty', clearable: true, retryable: true } });
    const buttons = w.findAll('button');
    expect(buttons.map(b => b.text())).toEqual(['Xóa bộ lọc']);
    await buttons[0].trigger('click');
    expect(w.emitted('clearFilters')).toHaveLength(1);
  });

  it('offline: không hứa tự gửi/đồng bộ; forbidden: nói rõ không có quyền', () => {
    const offline = mount(MobileFeedback, { props: { state: 'offline', retryable: true } });
    expect(offline.text()).toContain('mất kết nối');
    expect(offline.text()).not.toMatch(/tự gửi|tự động/i);
    expect(offline.find('button').exists()).toBe(true);
    const forbidden = mount(MobileFeedback, { props: { state: 'forbidden', retryable: true } });
    expect(forbidden.text()).toContain('không có quyền');
    expect(forbidden.find('button').exists()).toBe(false);
  });

  it('title/description tùy biến ghi đè mặc định', () => {
    const w = mount(MobileFeedback, { props: { state: 'empty', title: 'Chưa có lịch hẹn', description: 'Tạo lịch hẹn đầu tiên.' } });
    expect(w.text()).toContain('Chưa có lịch hẹn');
    expect(w.text()).toContain('Tạo lịch hẹn đầu tiên.');
  });
});
