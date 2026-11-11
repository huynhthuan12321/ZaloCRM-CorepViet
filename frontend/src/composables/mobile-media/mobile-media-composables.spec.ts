// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';

const m = vi.hoisted(() => ({
  listMediaPaged: vi.fn(),
  listMediaFolders: vi.fn(),
  sendMediaToConversation: vi.fn(),
  sendAlbumToConversation: vi.fn(),
  apiGet: vi.fn(),
  online: null as unknown as { value: boolean },
}));
vi.mock('@/api/media', () => ({
  listMediaPaged: m.listMediaPaged,
  listMediaFolders: m.listMediaFolders,
  sendMediaToConversation: m.sendMediaToConversation,
  sendAlbumToConversation: m.sendAlbumToConversation,
}));
vi.mock('@/api', () => ({ api: { get: m.apiGet } }));
vi.mock('@/composables/use-mobile', () => ({ useMobile: () => ({ isMobile: ref(true), isOnline: m.online }) }));
vi.mock('@/composables/use-privacy-visibility', () => ({ usePrivacyVisibility: () => ({ canSendInConv: () => true }) }));

import { useMobileMediaLibrary } from './use-mobile-media-library';
import { useMobileMediaSend } from './use-mobile-media-send';
import { useMobileMediaTargets } from './use-mobile-media-targets';
import type { MediaAssetItem } from '@/api/media';

m.online = ref(true);
const asset = (id: string, kind: MediaAssetItem['kind'] = 'image'): MediaAssetItem => ({
  id, kind, name: id, visibility: 'public', ownerUserId: null, tagIds: [], usageCount: 0, url: null, thumbnailUrl: null, sizeBytes: 1, createdAt: '2026-01-01',
}) as MediaAssetItem;
const items = (n: number, from = 0) => Array.from({ length: n }, (_, i) => asset(`a${from + i}`));
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };

function host<T>(factory: () => T) {
  let api!: T;
  const w = mount(defineComponent({ setup() { api = factory(); return () => h('div'); } }));
  return { api, w };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.online.value = true;
  m.listMediaFolders.mockResolvedValue([]);
});

describe('useMobileMediaLibrary: race', () => {
  it('đổi bộ lọc khi loadMore còn bay: loadingMore được reset, không kẹt, kết quả cũ bị bỏ', async () => {
    m.listMediaPaged.mockResolvedValueOnce({ items: items(30), total: 90 });
    const { api: lib } = host(() => useMobileMediaLibrary());
    await flushPromises();
    expect(lib.state.value).toBe('ready');

    const slow = deferred<{ items: MediaAssetItem[]; total: number }>();
    m.listMediaPaged.mockReturnValueOnce(slow.promise);
    void lib.loadMore();
    expect(lib.loadingMore.value).toBe(true);

    m.listMediaPaged.mockResolvedValueOnce({ items: [asset('v1', 'video')], total: 1 });
    lib.setKind('video');
    await flushPromises();
    expect(lib.loadingMore.value).toBe(false); // trước đây kẹt true vì finally của request cũ bị bỏ qua
    expect(lib.items.value.map(i => i.id)).toEqual(['v1']);

    slow.resolve({ items: items(30, 30), total: 90 }); // kết quả muộn của bộ lọc cũ
    await flushPromises();
    expect(lib.items.value.map(i => i.id)).toEqual(['v1']);
    expect(lib.loadingMore.value).toBe(false);
  });

  it('thư mục về muộn sau khi hủy (unmount) hoặc sau lần tải mới không ghi đè', async () => {
    const first = deferred<never[]>();
    m.listMediaFolders.mockReturnValueOnce(first.promise);
    m.listMediaPaged.mockResolvedValue({ items: [], total: 0 });
    const { api: lib, w } = host(() => useMobileMediaLibrary());
    await flushPromises();
    w.unmount();
    first.resolve([{ id: 'f1', name: 'Cũ', kind: 'image', visibility: 'public', ownerUserId: null }] as never);
    await flushPromises();
    expect(lib.folders.value).toEqual([]);
  });
});

describe('useMobileMediaSend', () => {
  const target = { convId: 'c1', customerName: 'A', nickName: 'N' };

  it('lỗi giữa chừng trả sentIds những mục đã xong', async () => {
    m.sendMediaToConversation.mockResolvedValueOnce({}).mockRejectedValueOnce({ response: { status: 429, data: {} } });
    const { api: s } = host(() => useMobileMediaSend());
    const r = await s.send([asset('1'), asset('2', 'video'), asset('3', 'file')], target);
    expect(r).toMatchObject({ ok: false, sent: 1, sentIds: ['1'], ambiguous: false });
  });

  it('album báo một phần/ít hơn/thiếu số: không vào sentIds, bỏ cả album khỏi vùng chọn, không tự thử lại', async () => {
    const { api: s } = host(() => useMobileMediaSend());
    const sel = [asset('1'), asset('2'), asset('3')];
    for (const reply of [{ sent: 2 }, { sent: 1 }, {}, { sent: 'x' }, null, { sent: 9 }]) {
      m.sendAlbumToConversation.mockClear();
      m.sendAlbumToConversation.mockResolvedValueOnce(reply);
      const r = await s.send(sel, target);
      expect(r.ok).toBe(false);
      expect(r.sentIds).toEqual([]);
      expect(r.unresolvedIds).toEqual(['1', '2', '3']);
      expect(r.resolvedIds).toEqual(['1', '2', '3']);
      expect(r.ambiguous).toBe(false);
      expect(r.error).toMatch(/[Kk]iểm tra hội thoại và tải lại kho/);
      expect(m.sendAlbumToConversation).toHaveBeenCalledTimes(1);
    }
    m.sendAlbumToConversation.mockResolvedValueOnce({ sent: 2 });
    const part = await s.send(sel, target);
    expect(part).toMatchObject({ sent: 2 });
    expect(part.error).toBe('Đã gửi 2/3 ảnh; máy chủ không cho biết ảnh nào, kiểm tra hội thoại và tải lại kho trước khi chọn lại.');
  });

  it('album báo 0 ảnh: không gì đi, giữ vùng chọn (không bỏ ảnh nào)', async () => {
    m.sendAlbumToConversation.mockResolvedValueOnce({ sent: 0 });
    const { api: s } = host(() => useMobileMediaSend());
    const r = await s.send([asset('1'), asset('2')], target);
    expect(r).toMatchObject({ ok: false, sent: 0, sentIds: [], resolvedIds: [], unresolvedIds: [] });
    expect(r.error).toContain('0/2');
  });

  it('hỗn hợp: kiểm tra mạng TRƯỚC MỖI request, dừng và báo mục đã xong, không gọi tiếp', async () => {
    m.sendMediaToConversation.mockImplementationOnce(async () => { m.online.value = false; return {}; });
    const { api: s } = host(() => useMobileMediaSend());
    const r = await s.send([asset('1', 'video'), asset('2', 'file'), asset('3', 'file')], target);
    expect(m.sendMediaToConversation).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, sentIds: ['1'], resolvedIds: ['1'], sent: 1, ambiguous: false });
    expect(r.error).toContain('Đã gửi xong 1/3');
    expect(r.error).toContain('không xếp hàng');
  });

  it('hỗn hợp nhiều hơn 5 mục vẫn gửi hết (không trần riêng)', async () => {
    m.sendMediaToConversation.mockResolvedValue({});
    const { api: s } = host(() => useMobileMediaSend());
    const r = await s.send(Array.from({ length: 7 }, (_, i) => asset(`f${i}`, 'file')), target);
    expect(r.ok).toBe(true);
    expect(m.sendMediaToConversation).toHaveBeenCalledTimes(7);
  });

  it('lỗi 5xx: ambiguous, không nói chưa gửi', async () => {
    m.sendMediaToConversation.mockRejectedValueOnce({ response: { status: 503, data: {} } });
    const { api: s } = host(() => useMobileMediaSend());
    const r = await s.send([asset('1')], target);
    expect(r.ambiguous).toBe(true);
    expect(r.sentIds).toEqual([]);
    expect(r.error).toContain('Không chắc');
  });

  it('album thành công trả đủ sentIds; lỗi album không có sentIds', async () => {
    m.sendAlbumToConversation.mockResolvedValueOnce({ sent: 2 });
    const { api: s } = host(() => useMobileMediaSend());
    expect((await s.send([asset('1'), asset('2')], target)).sentIds).toEqual(['1', '2']);
    m.sendAlbumToConversation.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    expect((await s.send([asset('1'), asset('2')], target)).sentIds).toEqual([]);
  });

  it('không có phản hồi -> ambiguous, lời khuyên kiểm tra hội thoại', async () => {
    m.sendMediaToConversation.mockRejectedValueOnce(new Error('timeout'));
    const { api: s } = host(() => useMobileMediaSend());
    const r = await s.send([asset('1')], target);
    expect(r.ambiguous).toBe(true);
    expect(r.error).toContain('kiểm tra trước khi gửi lại');
  });

  it('offline bị chặn ngay trong send(), không gọi API', async () => {
    m.online.value = false;
    const { api: s } = host(() => useMobileMediaSend());
    const r = await s.send([asset('1')], target);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('không xếp hàng chờ');
    expect(m.sendMediaToConversation).not.toHaveBeenCalled();
  });

  it('đích có lockReason bị chặn trong send()', async () => {
    const { api: s } = host(() => useMobileMediaSend());
    const r = await s.send([asset('1')], { ...target, lockReason: 'Nick Riêng tư' });
    expect(r.error).toBe('Nick Riêng tư');
    expect(m.sendMediaToConversation).not.toHaveBeenCalled();
  });
});

describe('useMobileMediaTargets: phân trang', () => {
  const conv = (id: string) => ({ id, threadType: 'user', contact: { fullName: `Khách ${id}` }, zaloAccount: { id: 'z', displayName: 'Nick', ownerUserId: 'u' } });
  const page = (from: number, n: number, total: number) => ({ data: { conversations: Array.from({ length: n }, (_, i) => conv(`c${from + i}`)), total } });

  it('khách ở trang sau tải được bằng loadMore, bỏ trùng, dừng khi đủ', async () => {
    m.apiGet.mockResolvedValueOnce(page(0, 40, 55));
    const { api: t } = host(() => useMobileMediaTargets());
    await t.load();
    expect(t.rows.value).toHaveLength(40);
    expect(t.hasMore.value).toBe(true);
    m.apiGet.mockResolvedValueOnce(page(35, 20, 55)); // 5 dòng trùng
    await t.loadMore();
    expect(m.apiGet.mock.calls[1][1].params).toMatchObject({ page: 2, limit: 40 });
    expect(t.rows.value).toHaveLength(55);
    expect(t.hasMore.value).toBe(false);
  });

  it('đổi từ khóa khi loadMore còn bay: reset loadingMore và bỏ kết quả cũ', async () => {
    m.apiGet.mockResolvedValueOnce(page(0, 40, 100));
    const { api: t } = host(() => useMobileMediaTargets());
    await t.load();
    const slow = deferred<ReturnType<typeof page>>();
    m.apiGet.mockReturnValueOnce(slow.promise);
    void t.loadMore();
    expect(t.loadingMore.value).toBe(true);
    m.apiGet.mockResolvedValueOnce(page(500, 2, 2));
    t.query.value = 'lan';
    await t.load();
    expect(t.loadingMore.value).toBe(false);
    slow.resolve(page(40, 40, 100));
    await flushPromises();
    expect(t.rows.value.map(r => r.convId)).toEqual(['c500', 'c501']);
  });

  it('lỗi tải thêm giữ danh sách cũ và cho thử lại', async () => {
    m.apiGet.mockResolvedValueOnce(page(0, 40, 80));
    const { api: t } = host(() => useMobileMediaTargets());
    await t.load();
    m.apiGet.mockRejectedValueOnce(new Error('x'));
    await t.loadMore();
    expect(t.moreError.value).toBe(true);
    expect(t.rows.value).toHaveLength(40);
    expect(t.hasMore.value).toBe(true);
  });
});
