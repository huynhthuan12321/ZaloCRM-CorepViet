// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';

const m = vi.hoisted(() => ({
  listMediaPaged: vi.fn(),
  listMediaFolders: vi.fn(),
  sendMediaToConversation: vi.fn(),
  sendAlbumToConversation: vi.fn(),
  confirm: vi.fn(),
  online: null as unknown as { value: boolean },
}));
vi.mock('@/api/media', () => ({
  listMediaPaged: m.listMediaPaged,
  listMediaFolders: m.listMediaFolders,
  sendMediaToConversation: m.sendMediaToConversation,
  sendAlbumToConversation: m.sendAlbumToConversation,
}));
vi.mock('@/composables/use-confirm', () => ({ useConfirm: () => ({ confirm: m.confirm }) }));
vi.mock('@/composables/use-toast', () => ({ useToast: () => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }) }));
vi.mock('@/composables/use-mobile', () => ({ useMobile: () => ({ isMobile: ref(true), isOnline: m.online }) }));
vi.mock('@/api', () => ({ api: { get: vi.fn() } }));
vi.mock('@/api/index', () => ({ api: { get: vi.fn() } }));

import MobileMediaLibrary from './MobileMediaLibrary.vue';
import MediaLibrarySheet from '@/components/mobile/chat/MediaLibrarySheet.vue';
import { StubBottomSheet } from '@/__tests__/mobile/test-utils';
import type { MediaAssetItem } from '@/api/media';
import type { MediaTarget } from './media-model';

const asset = (id: string, kind: MediaAssetItem['kind'] = 'image'): MediaAssetItem => ({
  id, kind, name: `Mục ${id}`, visibility: 'public', ownerUserId: null, tagIds: [], usageCount: 0, url: `https://example.test/${id}`, thumbnailUrl: `https://example.test/t-${id}`, sizeBytes: 2048, createdAt: '2026-01-01',
});
const target: MediaTarget = { convId: 'conv-A', customerName: 'Khách A', nickName: 'Nick 1', ownerName: 'Lan' };
// VDialog thật cần Vuetify đầy đủ + teleport: stub giữ hợp đồng model-value, render tại chỗ, Esc -> update:modelValue(false) như Vuetify.
const StubDialog = {
  props: ['modelValue', 'fullscreen', 'scrim', 'transition', 'contentClass'],
  emits: ['update:modelValue', 'afterEnter', 'afterLeave'],
  template: `<div v-if="modelValue" class="stub-dialog" @keydown.esc.stop.prevent="$emit('update:modelValue', false)"><slot /></div>`,
  // Vuetify bắn after-leave khi đóng xong; stub mô phỏng để kiểm trả focus.
  watch: { modelValue(this: { $nextTick: (f: () => void) => void; $emit: (e: string) => void }, v: boolean) { if (!v) this.$nextTick(() => this.$emit('afterLeave')); } },
};
const stubs = { VBottomSheet: StubBottomSheet, VDialog: StubDialog };
m.online = ref(true);

async function mountLib(props: Record<string, unknown> = {}) {
  const w = mount(MobileMediaLibrary, { props: { target, ...props }, global: { stubs }, attachTo: document.body });
  await flushPromises();
  return w;
}
const cells = (w: ReturnType<typeof mount>) => w.findAll('.m-mg__pick');

// Dọn mọi wrapper/watch/overlay giữa các ca, kể cả ca không gọi unmount tường minh.
enableAutoUnmount(afterEach);

beforeEach(() => {
  vi.clearAllMocks();
  m.online.value = true;
  m.listMediaFolders.mockResolvedValue([{ id: 'f1', name: 'Bảng giá', kind: 'image', visibility: 'public', ownerUserId: null }, { id: 'f2', name: 'Tài liệu A', kind: 'file', visibility: 'public', ownerUserId: null }]);
  m.listMediaPaged.mockResolvedValue({ items: [asset('1'), asset('2'), asset('3')], total: 3 });
  m.confirm.mockResolvedValue(true);
  m.sendMediaToConversation.mockResolvedValue({ message: {} });
  m.sendAlbumToConversation.mockResolvedValue({ sent: 2 });
  document.body.innerHTML = '';
});

describe('MobileMediaLibrary: danh sách', () => {
  it('tải ảnh theo loại, chỉ hiện thư mục của loại đó, hiện đích gửi với tên khách + nick', async () => {
    const w = await mountLib();
    expect(m.listMediaPaged.mock.calls[0][0]).toMatchObject({ kind: 'image', skip: 0, limit: 30 });
    expect(w.findAll('.m-mg__item')).toHaveLength(3);
    expect(w.text()).toContain('Bảng giá');
    expect(w.text()).not.toContain('Tài liệu A');
    expect(w.text()).toContain('Khách A');
    expect(w.text()).toContain('Nick Nick 1');
  });

  it('đổi loại/thư mục gọi lại với tham số mới', async () => {
    const w = await mountLib();
    await w.findAll('.m-ml__tab')[2].trigger('click');
    await flushPromises();
    expect(m.listMediaPaged.mock.calls.at(-1)![0]).toMatchObject({ kind: 'file', folderId: undefined, skip: 0 });
    expect(w.text()).toContain('Tài liệu A');
    await w.findAll('.m-ml__chip')[1].trigger('click');
    await flushPromises();
    expect(m.listMediaPaged.mock.calls.at(-1)![0]).toMatchObject({ kind: 'file', folderId: 'f2' });
  });

  it('tải thêm dùng skip = số đã có và không trùng id', async () => {
    m.listMediaPaged.mockResolvedValueOnce({ items: [asset('1'), asset('2')], total: 3 });
    const w = await mountLib();
    m.listMediaPaged.mockResolvedValueOnce({ items: [asset('2'), asset('3')], total: 3 });
    await w.get('.m-ml__loadmore').trigger('click');
    await flushPromises();
    expect(m.listMediaPaged.mock.calls.at(-1)![0]).toMatchObject({ skip: 2 });
    expect(w.findAll('.m-mg__item')).toHaveLength(3);
    expect(w.find('.m-ml__loadmore').exists()).toBe(false);
  });

  it('kết quả cũ về muộn không đè bộ lọc mới (race)', async () => {
    let resolveOld!: (v: unknown) => void;
    m.listMediaPaged.mockReturnValueOnce(new Promise((r) => { resolveOld = r; }));
    const w = mount(MobileMediaLibrary, { props: { target }, global: { stubs } });
    m.listMediaPaged.mockResolvedValueOnce({ items: [asset('new')], total: 1 });
    await w.findAll('.m-ml__tab')[1].trigger('click');
    await flushPromises();
    resolveOld({ items: [asset('old1'), asset('old2')], total: 2 });
    await flushPromises();
    expect(w.findAll('.m-mg__item')).toHaveLength(1);
  });

  it('rỗng, lỗi (có Thử lại) và offline', async () => {
    m.listMediaPaged.mockResolvedValueOnce({ items: [], total: 0 });
    const empty = await mountLib();
    expect(empty.text()).toContain('Chưa có mục nào');
    m.listMediaPaged.mockRejectedValueOnce({ response: { status: 500 } });
    const bad = await mountLib();
    expect(bad.text()).toContain('Không tải được Kho media');
    m.listMediaPaged.mockResolvedValueOnce({ items: [asset('1')], total: 1 });
    await bad.get('.m-feedback__btn').trigger('click');
    await flushPromises();
    expect(bad.findAll('.m-mg__item')).toHaveLength(1);
    m.online.value = false;
    m.listMediaPaged.mockRejectedValueOnce({});
    const off = await mountLib();
    expect(off.text()).toContain('Đang mất kết nối');
  });
});

describe('MobileMediaLibrary: gửi', () => {
  it('rời trang khi xác nhận đang mở rồi chấp nhận -> không gửi sau unmount', async () => {
    const w = await mountLib();
    await cells(w)[0].trigger('click');
    let release!: (v: boolean) => void;
    m.confirm.mockReturnValueOnce(new Promise<boolean>(r => { release = r; }));
    await w.get('[data-action="send"]').trigger('click');
    w.unmount();
    release(true);
    await flushPromises();
    expect(m.sendMediaToConversation).not.toHaveBeenCalled();
    expect(m.sendAlbumToConversation).not.toHaveBeenCalled();
  });

  it('1 ảnh -> sendMediaToConversation(id, convId snapshot) sau khi xác nhận có tên khách + nick', async () => {
    const w = await mountLib();
    await cells(w)[0].trigger('click');
    await w.get('[data-action="send"]').trigger('click');
    await flushPromises();
    expect(m.confirm.mock.calls[0][0]).toMatchObject({ title: expect.stringContaining('Khách A'), message: expect.stringContaining('Nick 1') });
    expect(m.sendMediaToConversation).toHaveBeenCalledWith('1', 'conv-A');
    expect(w.emitted('sent')).toEqual([[{ convId: 'conv-A', sent: 1 }]]);
    expect(w.find('.m-ml__bar').exists()).toBe(false); // bỏ chọn sau khi gửi
  });

  it('nhiều ảnh -> sendAlbumToConversation(ids, convId đã xác nhận)', async () => {
    const w = await mountLib();
    await cells(w)[0].trigger('click');
    await cells(w)[1].trigger('click');
    await w.get('[data-action="send"]').trigger('click');
    await flushPromises();
    expect(m.sendAlbumToConversation).toHaveBeenCalledWith(['1', '2'], 'conv-A');
  });

  it('đổi hội thoại nhận khi hộp xác nhận đang mở -> HỦY, không gửi ngầm (cả đích cũ lẫn mới)', async () => {
    const w = await mountLib();
    await cells(w)[0].trigger('click');
    await cells(w)[1].trigger('click');
    let release!: (v: boolean) => void;
    m.confirm.mockReturnValueOnce(new Promise<boolean>((r) => { release = r; }));
    await w.get('[data-action="send"]').trigger('click');
    await w.setProps({ target: { ...target, convId: 'conv-B', customerName: 'Khách B' } });
    release(true);
    await flushPromises();
    expect(m.sendAlbumToConversation).not.toHaveBeenCalled();
    expect(m.sendMediaToConversation).not.toHaveBeenCalled();
    expect(w.get('.m-ml__err').text()).toContain('đã thay đổi');
    expect(w.find('.m-ml__bar').exists()).toBe(true); // vẫn giữ vùng chọn
  });

  it('khóa ngoài xuất hiện khi hộp xác nhận đang mở -> hủy', async () => {
    const w = await mountLib({ fixedTarget: true });
    await cells(w)[0].trigger('click');
    let release!: (v: boolean) => void;
    m.confirm.mockReturnValueOnce(new Promise<boolean>((r) => { release = r; }));
    await w.get('[data-action="send"]').trigger('click');
    await w.setProps({ externalLock: 'Nick này đang ở chế độ Riêng tư' });
    release(true);
    await flushPromises();
    expect(m.sendMediaToConversation).not.toHaveBeenCalled();
    expect(w.get('.m-ml__err').text()).toContain('Riêng tư');
  });

  it('props target đổi object nhưng cùng convId khi xác nhận -> vẫn gửi đích đã xác nhận', async () => {
    const w = await mountLib();
    await cells(w)[0].trigger('click');
    let release!: (v: boolean) => void;
    m.confirm.mockReturnValueOnce(new Promise<boolean>((r) => { release = r; }));
    await w.get('[data-action="send"]').trigger('click');
    await w.setProps({ target: { ...target, ownerName: 'Mai' } });
    release(true);
    await flushPromises();
    expect(m.sendMediaToConversation).toHaveBeenCalledWith('1', 'conv-A');
  });

  it('mất mạng trong lúc xác nhận -> chặn ngay trước khi gọi API', async () => {
    const w = await mountLib();
    await cells(w)[0].trigger('click');
    let release!: (v: boolean) => void;
    m.confirm.mockReturnValueOnce(new Promise<boolean>((r) => { release = r; }));
    await w.get('[data-action="send"]').trigger('click');
    m.online.value = false;
    release(true);
    await flushPromises();
    expect(m.sendMediaToConversation).not.toHaveBeenCalled();
    expect(w.text()).toContain('không xếp hàng chờ');
  });

  it('hủy xác nhận -> không gọi API', async () => {
    m.confirm.mockResolvedValueOnce(false);
    const w = await mountLib();
    await cells(w)[0].trigger('click');
    await w.get('[data-action="send"]').trigger('click');
    await flushPromises();
    expect(m.sendMediaToConversation).not.toHaveBeenCalled();
  });

  it('hỗn hợp -> gửi tuần tự, dừng ở lỗi đầu và báo đã gửi mấy mục', async () => {
    m.listMediaPaged.mockResolvedValue({ items: [asset('1'), asset('2', 'video'), asset('3', 'file')], total: 3 });
    m.sendMediaToConversation.mockResolvedValueOnce({}).mockRejectedValueOnce({ response: { status: 413, data: {} } });
    const w = await mountLib();
    for (const c of cells(w)) await c.trigger('click');
    await w.get('[data-action="send"]').trigger('click');
    await flushPromises();
    expect(m.sendMediaToConversation).toHaveBeenCalledTimes(2);
    expect(w.get('.m-ml__err').text()).toContain('quá lớn');
    expect(w.get('.m-ml__err').text()).toContain('Đã gửi xong 1/3');
    // Mục đã gửi xong (1) bị bỏ khỏi vùng chọn NGAY; chỉ còn 2 mục chưa gửi -> thử lại không gửi trùng.
    expect(w.find('.m-ml__bar').exists()).toBe(true);
    expect(w.get('.m-ml__count').text()).toContain('1 video, 1 tài liệu');
    expect(w.get('.m-ml__count').text()).not.toContain('ảnh');
    expect(w.emitted('sent')).toEqual([[{ convId: 'conv-A', sent: 1 }]]);
    m.sendMediaToConversation.mockClear();
    m.sendMediaToConversation.mockResolvedValue({});
    await w.get('[data-action="send"]').trigger('click');
    await flushPromises();
    expect(m.sendMediaToConversation.mock.calls.map(c => c[0])).toEqual(['2', '3']); // không gửi lại '1'
  });

  it('album báo một phần: bỏ cả album khỏi vùng chọn, trạng thái bền vững hiện NGOÀI thanh chọn, không tự gửi lại', async () => {
    m.sendAlbumToConversation.mockResolvedValue({ sent: 2 });
    m.listMediaPaged.mockResolvedValue({ items: [asset('1'), asset('2'), asset('3')], total: 3 });
    const w = await mountLib();
    for (const c of cells(w)) await c.trigger('click');
    await w.get('[data-action="send"]').trigger('click');
    await flushPromises();
    expect(m.sendAlbumToConversation).toHaveBeenCalledTimes(1);
    expect(w.find('.m-ml__bar').exists()).toBe(false); // vùng chọn đã trống
    const st = w.get('[data-testid="send-status"]');
    expect(st.text()).toContain('Đã gửi 2/3 ảnh; máy chủ không cho biết ảnh nào');
    expect(st.text()).not.toMatch(/đã gửi (tất cả|thành công)/i);
    expect(w.emitted('sent')).toEqual([[{ convId: 'conv-A', sent: 2 }]]);
    // Chọn rồi bỏ chọn không làm mất trạng thái; chỉ đóng khi người dùng bấm.
    await cells(w)[0].trigger('click');
    await w.get('.m-ml__bar .m-ml__btn').trigger('click');
    expect(w.find('[data-testid="send-status"]').exists()).toBe(true);
    await st.findAll('.m-ml__btn')[1].trigger('click');
    expect(w.find('[data-testid="send-status"]').exists()).toBe(false);
    expect(m.sendAlbumToConversation).toHaveBeenCalledTimes(1);
  });

  it('lỗi không có phản hồi (quá giờ): không khẳng định chưa gửi, khuyên kiểm tra hội thoại trước khi gửi lại', async () => {
    m.sendMediaToConversation.mockRejectedValueOnce({ code: 'ECONNABORTED' });
    const w = await mountLib();
    await cells(w)[0].trigger('click');
    await w.get('[data-action="send"]').trigger('click');
    await flushPromises();
    expect(w.get('.m-ml__err').text()).toContain('kiểm tra trước khi gửi lại');
    expect(w.emitted('sent')).toBeUndefined();
  });

  it.each([
    [403, 'không có quyền'], [409, 'đã bị xóa'], [415, 'chưa được hỗ trợ'], [429, 'quá nhanh'],
  ])('lỗi %s hiện chữ tiếng Việt cụ thể', async (status, text) => {
    m.sendMediaToConversation.mockRejectedValueOnce({ response: { status, data: {} } });
    const w = await mountLib();
    await cells(w)[0].trigger('click');
    await w.get('[data-action="send"]').trigger('click');
    await flushPromises();
    expect(w.get('.m-ml__err').text()).toContain(text);
  });

  it('offline khóa nút Gửi, nói rõ không xếp hàng chờ, không gọi API', async () => {
    const w = await mountLib();
    await cells(w)[0].trigger('click');
    m.online.value = false;
    await flushPromises();
    const btn = w.get('[data-action="send"]');
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
    expect(w.get('.m-ml__lock').text()).toContain('không xếp hàng chờ');
    await btn.trigger('click');
    expect(m.sendMediaToConversation).not.toHaveBeenCalled();
  });

  it('chưa chọn đích (trang /media) -> Gửi bị khóa, có nút Chọn khách phát changeTarget', async () => {
    const w = await mountLib({ target: null });
    await cells(w)[0].trigger('click');
    expect((w.get('[data-action="send"]').element as HTMLButtonElement).disabled).toBe(true);
    expect(w.get('.m-ml__lock').text()).toContain('chọn hội thoại');
    await w.get('.m-ml__link').trigger('click');
    expect(w.emitted('changeTarget')).toHaveLength(1);
  });

  it('khóa ngoài (nick Riêng tư...) hiện lý do và khóa Gửi; fixedTarget không có nút Đổi', async () => {
    const w = await mountLib({ fixedTarget: true, externalLock: 'Nick này đang ở chế độ Riêng tư' });
    expect(w.find('.m-ml__link').exists()).toBe(false);
    await cells(w)[0].trigger('click');
    expect((w.get('[data-action="send"]').element as HTMLButtonElement).disabled).toBe(true);
    expect(w.get('.m-ml__lock').text()).toContain('Riêng tư');
  });
});

describe('MobileMediaLibrary: trình xem', () => {
  it('viewer không tự khóa/mở khóa cuộn body (VDialog quản): đóng sẵn không đụng overflow của sheet bên dưới', async () => {
    document.body.style.overflow = 'hidden'; // giả lập sheet bên dưới đang khóa cuộn
    const w = await mountLib();
    await flushPromises();
    expect(document.body.style.overflow).toBe('hidden');
    w.unmount();
    expect(document.body.style.overflow).toBe('hidden');
    document.body.style.overflow = '';
  });

  it('mở viewer, chuyển bằng nút và vuốt, đóng bằng nút / vuốt xuống / Esc', async () => {
    const w = await mountLib();
    await w.findAll('.m-mg__cell')[0].trigger('click');
    const viewer = () => document.body.querySelector('.m-viewer') as HTMLElement | null;
    expect(viewer()).not.toBeNull();
    expect(viewer()!.textContent).toContain('1/3');
    (document.body.querySelector('[aria-label="Mục sau"]') as HTMLElement).click();
    await flushPromises();
    expect(viewer()!.textContent).toContain('2/3');

    const stage = viewer()!.querySelector('.m-viewer__stage') as HTMLElement;
    const touch = (type: string, x: number, y: number) => {
      const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & { touches: unknown[] };
      ev.touches = type === 'touchend' ? [] : [{ clientX: x, clientY: y }];
      stage.dispatchEvent(ev);
    };
    touch('touchstart', 200, 300); touch('touchmove', 100, 305); touch('touchend', 100, 305);
    await flushPromises();
    expect(viewer()!.textContent).toContain('3/3');
    touch('touchstart', 100, 100); touch('touchmove', 105, 260); touch('touchend', 105, 260);
    await flushPromises();
    expect(viewer()).toBeNull();

    await w.findAll('.m-mg__cell')[1].trigger('click');
    // VTU trigger gắn timestamp hợp lệ cho listener vừa mount; raw dispatch trong cùng ms bị Vue bỏ qua.
    await w.get('.m-viewer').trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(viewer()).toBeNull();
    w.unmount();
  });

  it('vuốt bắt đầu trên VIDEO không đổi mục / không đóng viewer', async () => {
    m.listMediaPaged.mockResolvedValue({ items: [asset('v1', 'video'), asset('v2', 'video')], total: 2 });
    const w = await mountLib();
    await w.findAll('.m-mg__cell')[0].trigger('click');
    const viewer = () => document.body.querySelector('.m-viewer') as HTMLElement;
    const video = viewer().querySelector('video') as HTMLElement;
    expect(video).not.toBeNull();
    const touch = (el: HTMLElement, type: string, x: number, y: number) => {
      const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & { touches: unknown[] };
      ev.touches = type === 'touchend' ? [] : [{ clientX: x, clientY: y }];
      el.dispatchEvent(ev);
      return ev;
    };
    touch(video, 'touchstart', 200, 300);
    const mv = touch(video, 'touchmove', 60, 305);
    touch(video, 'touchend', 60, 305);
    touch(video, 'touchstart', 100, 100); touch(video, 'touchmove', 100, 300); touch(video, 'touchend', 100, 300);
    await flushPromises();
    expect(mv.defaultPrevented).toBe(false);
    expect(viewer()).not.toBeNull();
    expect(viewer().textContent).toContain('1/2');
    // Nút Trước/Sau vẫn dùng được.
    (document.body.querySelector('[aria-label="Mục sau"]') as HTMLElement).click();
    await flushPromises();
    expect(viewer().textContent).toContain('2/2');
    w.unmount();
  });

  it('từ chối chọn (quá 12) hiện ngay trong viewer bằng role=status', async () => {
    m.listMediaPaged.mockResolvedValue({ items: Array.from({ length: 13 }, (_, i) => asset(`p${i}`)), total: 13 });
    const w = await mountLib();
    for (const c of cells(w).slice(0, 12)) await c.trigger('click');
    await w.findAll('.m-mg__cell')[12].trigger('click');
    (document.body.querySelector('.m-viewer__pick') as HTMLElement).click();
    await flushPromises();
    const st = document.body.querySelector('.m-viewer__notice') as HTMLElement;
    expect(st).not.toBeNull();
    expect(st.getAttribute('role')).toBe('status');
    expect(st.textContent).toContain('Tối đa 12');
    w.unmount();
  });

  it('click ô chưa focus (Safari) rồi đóng viewer trả focus về ô; viewer không lồng role=dialog', async () => {
    const w = await mountLib();
    const cell = w.findAll('.m-mg__cell')[0].element as HTMLElement;
    expect(document.activeElement).toBe(document.body);
    await w.findAll('.m-mg__cell')[0].trigger('click');
    const viewer = document.body.querySelector('.m-viewer') as HTMLElement;
    expect(viewer.getAttribute('role')).not.toBe('dialog');
    expect(viewer.hasAttribute('aria-modal')).toBe(false);
    const closeBtn = viewer.querySelector('[aria-label="Đóng trình xem"]') as HTMLElement;
    closeBtn.focus();
    closeBtn.click();
    await flushPromises();
    await flushPromises();
    expect(document.body.querySelector('.m-viewer')).toBeNull();
    expect(document.activeElement).toBe(cell);
    w.unmount();
  });

  it('chọn từ viewer đồng bộ với lưới', async () => {
    const w = await mountLib();
    await w.findAll('.m-mg__cell')[0].trigger('click');
    (document.body.querySelector('.m-viewer__pick') as HTMLElement).click();
    await flushPromises();
    expect(w.find('.m-ml__bar').exists()).toBe(true);
    expect(w.get('.m-ml__count').text()).toContain('1 ảnh');
    w.unmount();
  });
});

describe('MediaLibrarySheet (thread): đích cố định, đóng khi đổi hội thoại', () => {
  const mountSheet = (props: Record<string, unknown> = {}) => mount(MediaLibrarySheet, {
    props: { open: true, conversationId: 'conv-A', currentConversationId: 'conv-A', contact: { fullName: 'Nguyễn Văn A' } as never, nickName: 'Nick Bán Hàng', disabled: false, ...props },
    global: { stubs },
  });
  it('hiện tên khách + nick và gửi vào convId snapshot', async () => {
    const w = mountSheet();
    await flushPromises();
    expect(w.text()).toContain('Nguyễn Văn A');
    expect(w.text()).toContain('Nick Bán Hàng');
    expect(w.find('.m-ml__link').exists()).toBe(false);
    await w.get('.m-mg__pick').trigger('click');
    await w.get('[data-action="send"]').trigger('click');
    await flushPromises();
    expect(m.sendMediaToConversation).toHaveBeenCalledWith('1', 'conv-A');
  });
  it('khóa của thread: vẫn xem được kho, hiện lý do, khóa Gửi', async () => {
    const w = mountSheet({ disabled: true, disabledReason: 'Đang mất kết nối. Ảnh và tệp không xếp hàng chờ.' });
    await flushPromises();
    expect(w.get('.m-media__lock').text()).toContain('Đang mất kết nối');
    await w.get('.m-mg__pick').trigger('click');
    expect((w.get('[data-action="send"]').element as HTMLButtonElement).disabled).toBe(true);
  });
  it('đổi hội thoại khi sheet mở -> tự đóng và không dựng thư viện', async () => {
    const w = mountSheet();
    await w.setProps({ currentConversationId: 'conv-B' });
    expect(w.emitted('update:open')).toEqual([[false]]);
    expect(w.find('.m-ml').exists()).toBe(false);
  });
});
