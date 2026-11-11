// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import MobileSheet from './MobileSheet.vue';
import { confirmState, resolveConfirm } from '@/composables/use-confirm';

// VBottomSheet thật teleport + cần Vuetify đầy đủ; stub giữ đúng hợp đồng: model-value + update:model-value.
const VBottomSheet = {
  props: ['modelValue', 'persistent', 'contentClass'],
  emits: ['update:modelValue', 'afterEnter'],
  template: '<div v-if="modelValue" class="stub-sheet" :data-persistent="persistent" :data-content-class="contentClass"><slot /></div>',
};

function mountSheet(props: Record<string, unknown> = {}) {
  return mount(MobileSheet, {
    props: { open: true, title: 'Bộ lọc', ...props },
    slots: { default: '<p class="body">nội dung</p>', footer: '<button class="foot">Áp dụng</button>' },
    global: { stubs: { VBottomSheet } },
  });
}

beforeEach(() => {
  confirmState.value = { open: false, title: '' };
});

describe('MobileSheet', () => {
  it('render dialog có tên truy cập, nội dung và footer; content-class chứa crm-mobile cho overlay teleport', () => {
    const w = mountSheet();
    const panel = w.get('[role="dialog"]');
    expect(panel.attributes('aria-modal')).toBe('true');
    const labelledBy = panel.attributes('aria-labelledby')!;
    expect(w.get(`#${labelledBy}`).text()).toBe('Bộ lọc');
    expect(w.find('.body').exists()).toBe(true);
    expect(w.find('.foot').exists()).toBe(true);
    expect(w.get('.stub-sheet').attributes('data-content-class')).toContain('crm-mobile');
    expect(panel.classes()).toContain('crm-mobile');
  });

  it('không có footer: body có class bare (cộng safe-bottom); có footer thì không', () => {
    const withFooter = mountSheet();
    expect(withFooter.get('.m-sheet__body').classes()).not.toContain('m-sheet__body--bare');
    const bare = mount(MobileSheet, {
      props: { open: true, title: 'Bộ lọc' },
      slots: { default: '<p class="body">nội dung</p>' },
      global: { stubs: { VBottomSheet } },
    });
    expect(bare.get('.m-sheet__body').classes()).toContain('m-sheet__body--bare');
  });

  it('đóng: nút Đóng có aria-label và phát update:open(false) + close', async () => {
    const w = mountSheet();
    await w.get('button[aria-label="Đóng"]').trigger('click');
    expect(w.emitted('update:open')).toEqual([[false]]);
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('Esc / chạm nền (Vuetify phát update:model-value=false) cũng đi qua đường đóng', async () => {
    const w = mountSheet();
    w.findComponent(VBottomSheet).vm.$emit('update:modelValue', false);
    await flushPromises();
    expect(w.emitted('update:open')).toEqual([[false]]);
  });

  it('dirty: hỏi xác nhận trước khi đóng; hủy -> giữ nguyên; đồng ý -> đóng', async () => {
    const w = mountSheet({ dirty: true });
    await w.get('button[aria-label="Đóng"]').trigger('click');
    expect(confirmState.value.open).toBe(true);
    expect(w.emitted('update:open')).toBeUndefined();

    resolveConfirm(false, '');
    await flushPromises();
    expect(w.emitted('update:open')).toBeUndefined();

    await w.get('button[aria-label="Đóng"]').trigger('click');
    resolveConfirm(true, '');
    await flushPromises();
    expect(w.emitted('update:open')).toEqual([[false]]);
  });

  it('persistent được chuyển xuống Vuetify (chặn chạm nền/Esc)', () => {
    const w = mountSheet({ persistent: true });
    expect(w.get('.stub-sheet').attributes('data-persistent')).toBe('true');
  });

  it('open=false không render panel', () => {
    const w = mountSheet({ open: false });
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });
});
