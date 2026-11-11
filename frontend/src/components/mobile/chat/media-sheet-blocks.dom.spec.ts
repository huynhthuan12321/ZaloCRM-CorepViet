// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';

const m = vi.hoisted(() => ({ extension: true, panelProps: [] as Array<Record<string, unknown>> }));
vi.mock('@ee/edition', () => ({ get isExtension() { return m.extension; } }));
vi.mock('@ee/automation/chat-blocks/AutomationBlocksPanel.vue', () => ({
  default: defineComponent({
    name: 'AutomationBlocksPanel',
    props: ['conversationId', 'contact', 'ownerNickId', 'nickName'],
    setup(props) { m.panelProps.push({ ...props }); return () => h('div', { class: 'blocks-panel' }, `blocks:${props.conversationId}`); },
  }),
}));
vi.mock('@/api/media', () => ({
  listMediaPaged: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  listMediaFolders: vi.fn().mockResolvedValue([]),
  sendMediaToConversation: vi.fn(),
  sendAlbumToConversation: vi.fn(),
}));
vi.mock('@/composables/use-mobile', () => ({ useMobile: () => ({ isMobile: ref(true), isOnline: ref(true) }) }));
vi.mock('@/composables/use-confirm', () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock('@/composables/use-toast', () => ({ useToast: () => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }) }));

import MediaLibrarySheet from './MediaLibrarySheet.vue';
import { StubBottomSheet } from '@/__tests__/mobile/test-utils';

const mountSheet = (props: Record<string, unknown> = {}) => mount(MediaLibrarySheet, {
  props: { open: true, conversationId: 'conv-A', currentConversationId: 'conv-A', contact: { fullName: 'A' } as never, ownerNickId: 'nick-1', nickName: 'Nick', disabled: false, ...props },
  global: { stubs: { VBottomSheet: StubBottomSheet } },
});

beforeEach(() => { m.extension = true; m.panelProps.length = 0; });

describe('MediaLibrarySheet: tab Khối (parity MediaTabPanel)', () => {
  it('bản mở rộng: có tab Khối, mở ra AutomationBlocksPanel nguyên bản với đúng conversationId/nick/contact', async () => {
    const w = mountSheet();
    await flushPromises();
    expect(w.find('[data-pane="block"]').exists()).toBe(true);
    expect(w.find('.blocks-panel').exists()).toBe(false); // chưa mở thì chưa mount
    await w.get('[data-pane="block"]').trigger('click');
    expect(w.get('.blocks-panel').text()).toBe('blocks:conv-A');
    expect(m.panelProps[0]).toMatchObject({ conversationId: 'conv-A', ownerNickId: 'nick-1', nickName: 'Nick' });
    await w.get('[data-pane="media"]').trigger('click');
    expect(w.find('.blocks-panel').exists()).toBe(false);
    expect(w.find('.m-ml').exists()).toBe(true);
  });
  it('thread khóa gửi: pane Khối chỉ hiện lý do, KHÔNG mount panel (panel gửi tin)', async () => {
    const w = mountSheet({ disabled: true, disabledReason: 'Nick đã bị xóa khỏi CRM' });
    await w.get('[data-pane="block"]').trigger('click');
    expect(w.find('.blocks-panel').exists()).toBe(false);
    expect(w.get('.m-media__lock').text()).toContain('Nick đã bị xóa');
  });
  it('bản Community: không có tab Khối (stub không có nội dung)', async () => {
    m.extension = false;
    const w = mountSheet();
    await flushPromises();
    expect(w.find('[data-pane="block"]').exists()).toBe(false);
  });
  it('đổi hội thoại khi đang ở tab Khối -> sheet tự đóng', async () => {
    const w = mountSheet();
    await w.get('[data-pane="block"]').trigger('click');
    await w.setProps({ currentConversationId: 'conv-B' });
    expect(w.emitted('update:open')).toEqual([[false]]);
  });
});
