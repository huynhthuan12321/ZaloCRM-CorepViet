// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MobilePageHeader from './MobilePageHeader.vue';

describe('MobilePageHeader', () => {
  it('root tab: có h1, không có nút quay lại', () => {
    const w = mount(MobilePageHeader, { props: { title: 'Tổng quan' } });
    expect(w.get('h1').text()).toBe('Tổng quan');
    expect(w.find('button[aria-label="Quay lại"]').exists()).toBe(false);
  });

  it('showBack: nút quay lại có aria-label và phát back', async () => {
    const w = mount(MobilePageHeader, { props: { title: 'Kho media', showBack: true } });
    const back = w.get('button[aria-label="Quay lại"]');
    await back.trigger('click');
    expect(w.emitted('back')).toHaveLength(1);
  });

  it('subtitle hiển thị khi có', () => {
    const w = mount(MobilePageHeader, { props: { title: 'Báo cáo', subtitle: 'CRM · Tổ chức A' } });
    expect(w.text()).toContain('CRM · Tổ chức A');
  });

  it('action là icon button có aria-label; tối đa 2; disabled không phát sự kiện', async () => {
    const w = mount(MobilePageHeader, {
      props: {
        title: 'X',
        actions: [
          { id: 'search', icon: 'mdi-magnify', label: 'Tìm kiếm' },
          { id: 'filter', icon: 'mdi-filter-variant', label: 'Lọc', disabled: true },
          { id: 'extra', icon: 'mdi-plus', label: 'Thêm' },
        ],
      },
    });
    const buttons = w.findAll('button');
    expect(buttons.map(b => b.attributes('aria-label'))).toEqual(['Tìm kiếm', 'Lọc']);
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    expect(w.emitted('action')).toEqual([['search']]);
  });

  it('slot trailing (NotificationBell) được render; icon trang trí ẩn khỏi trình đọc màn hình', () => {
    const w = mount(MobilePageHeader, { props: { title: 'X', showBack: true }, slots: { trailing: '<span class="bell">bell</span>' } });
    expect(w.find('.bell').exists()).toBe(true);
    expect(w.get('i.mdi').attributes('aria-hidden')).toBe('true');
  });
});
