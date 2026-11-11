import { describe, expect, it } from 'vitest';
import type { MediaAssetItem } from '@/api/media';
import {
  describeMediaLoadError, describeMediaSendError, isAmbiguousSendError, formatBytes, formatDuration, hasMoreMedia, mediaSendLockReason, mergeMediaPage,
  planMediaSend, resolveViewerSwipe, summarizeSelection, toggleMediaSelection, type MediaTarget,
} from './media-model';

const asset = (id: string, kind: MediaAssetItem['kind'] = 'image'): MediaAssetItem => ({
  id, kind, name: `Mục ${id}`, visibility: 'public', ownerUserId: null, tagIds: [], usageCount: 0, url: `https://example.test/${id}`, thumbnailUrl: null, sizeBytes: 2048, createdAt: '2026-01-01',
});
const target: MediaTarget = { convId: 'conv-A', customerName: 'Khách A', nickName: 'Nick 1' };
const err = (status?: number, data: Record<string, string> = {}) => ({ response: status ? { status, data } : undefined });

describe('định dạng', () => {
  it('formatBytes / formatDuration', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(null)).toBe('');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(0)).toBe('');
  });
});

describe('phân trang & chọn', () => {
  it('mergeMediaPage bỏ trùng id', () => {
    const merged = mergeMediaPage([asset('1'), asset('2')], [asset('2'), asset('3')]);
    expect(merged.map(i => i.id)).toEqual(['1', '2', '3']);
  });
  it('hasMoreMedia dừng khi trang rỗng hoặc đã đủ', () => {
    expect(hasMoreMedia(30, 70, 30)).toBe(true);
    expect(hasMoreMedia(70, 70, 10)).toBe(false);
    expect(hasMoreMedia(30, 70, 0)).toBe(false);
  });
  it('toggleMediaSelection: chọn/bỏ, trần chung 12 mục, không trần riêng cho tệp', () => {
    let sel: MediaAssetItem[] = [];
    sel = toggleMediaSelection(sel, asset('1')).next;
    sel = toggleMediaSelection(sel, asset('1')).next;
    expect(sel).toEqual([]);
    for (let i = 0; i < 12; i++) sel = toggleMediaSelection(sel, asset(`i${i}`)).next;
    const over = toggleMediaSelection(sel, asset('x'));
    expect(over.next).toHaveLength(12);
    expect(over.rejected).toContain('12');
    // Không có trần riêng cho video/tài liệu: 8 tệp vẫn chọn được (chỉ trần chung 12 như album).
    let docs: MediaAssetItem[] = [];
    for (let i = 0; i < 8; i++) docs = toggleMediaSelection(docs, asset(`d${i}`, 'file')).next;
    expect(docs).toHaveLength(8);
    expect(toggleMediaSelection(docs, asset('d8', 'video')).rejected).toBeNull();
    expect(summarizeSelection([asset('1'), asset('2'), asset('3', 'video'), asset('4', 'file')])).toBe('2 ảnh, 1 video, 1 tài liệu');
  });
});

describe('planMediaSend: dùng đúng luồng MediaTabPanel', () => {
  it('1 mục -> single; nhiều ảnh -> album; hỗn hợp -> sequence', () => {
    expect(planMediaSend([])).toBeNull();
    expect(planMediaSend([asset('1', 'video')])?.mode).toBe('single');
    expect(planMediaSend([asset('1'), asset('2')])?.mode).toBe('album');
    expect(planMediaSend([asset('1'), asset('2', 'file')])?.mode).toBe('sequence');
  });
});

describe('mediaSendLockReason', () => {
  it('offline thắng mọi lý do và không hứa tự gửi', () => {
    const r = mediaSendLockReason({ online: false, target, busy: false });
    expect(r).toContain('mất kết nối');
    expect(r).toContain('không xếp hàng chờ');
  });
  it('thiếu đích / đích khóa / đang gửi / bình thường', () => {
    expect(mediaSendLockReason({ online: true, target: null, busy: false })).toContain('chọn hội thoại');
    expect(mediaSendLockReason({ online: true, target: { ...target, lockReason: 'Nick đã bị xóa' }, busy: false })).toBe('Nick đã bị xóa');
    expect(mediaSendLockReason({ online: true, target, busy: true })).toContain('Đang gửi');
    expect(mediaSendLockReason({ online: true, target, busy: false })).toBeNull();
  });
});

describe('describeMediaSendError (403/409/413/415/429 tiếng Việt cụ thể)', () => {
  it.each([
    [403, { code: 'PRIVACY_LOCKED' }, 'Riêng tư'],
    [403, {}, 'không có quyền'],
    [409, {}, 'đã bị xóa'],
    [413, {}, 'quá lớn'],
    [415, {}, 'chưa được hỗ trợ'],
    [429, {}, 'quá nhanh'],
    [404, {}, 'Không tìm thấy'],
  ])('%s %j chứa "%s"', (status, data, expected) => {
    expect(describeMediaSendError(err(status as number, data as Record<string, string>))).toContain(expected);
  });
  it('mất mạng; 500 không lộ chuỗi kỹ thuật', () => {
    expect(describeMediaSendError(err())).toContain('Không chắc');
    expect(describeMediaSendError(err(500, { error: 'ECONNRESET stack' }))).not.toContain('ECONNRESET');
    // 5xx có thể xảy ra SAU khi đã gửi Zalo: không nói "chưa gửi", không khuyến khích gửi lại.
    for (const s of [500, 502, 503, 504]) {
      const t = describeMediaSendError(err(s));
      expect(t).toContain('Không chắc');
      expect(t).toContain('kiểm tra');
      expect(t).not.toMatch(/chưa gửi được|hãy thử lại/i);
      expect(isAmbiguousSendError(err(s))).toBe(true);
    }
    expect(isAmbiguousSendError(err())).toBe(true);
    expect(isAmbiguousSendError(err(413))).toBe(false);
  });
  it('400 nick không kết nối: nhận mã NICK_NOT_CONNECTED, chữ tiếng Việt thật của backend và chữ tiếng Anh cũ', () => {
    for (const d of [{ code: 'NICK_NOT_CONNECTED', error: 'x' }, { error: 'Nick Zalo chưa kết nối' }, { error: 'account not connected' }]) {
      expect(describeMediaSendError(err(400, d as Record<string, string>))).toContain('không kết nối');
    }
    expect(describeMediaSendError(err(400, { error: 'assetIds required' }))).toContain('không hợp lệ');
  });
  it('describeMediaLoadError', () => {
    expect(describeMediaLoadError(err(403), true).state).toBe('forbidden');
    expect(describeMediaLoadError(err(), false).state).toBe('offline');
    expect(describeMediaLoadError(err(500), true).state).toBe('error');
  });
});

describe('resolveViewerSwipe', () => {
  it('vuốt ngang đổi mục, vuốt xuống đóng, dịch nhẹ thì bỏ qua', () => {
    expect(resolveViewerSwipe(-80, 10)).toBe('next');
    expect(resolveViewerSwipe(80, -10)).toBe('prev');
    expect(resolveViewerSwipe(-20, 5)).toBeNull();
    expect(resolveViewerSwipe(10, 140)).toBe('close');
    expect(resolveViewerSwipe(10, 40)).toBeNull();
    expect(resolveViewerSwipe(5, -140)).toBeNull(); // vuốt lên không đóng
    expect(resolveViewerSwipe(-120, 100)).toBe('next'); // ngang trội hơn thì đổi mục
  });
});
