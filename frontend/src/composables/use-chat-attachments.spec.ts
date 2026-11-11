import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/index', () => ({ api: { post: vi.fn(async () => ({ data: {} })) } }));

import { api } from '@/api/index';
import { CHAT_ATTACHMENT_LIMITS, uploadChatAttachments, validateAttachment } from './use-chat-attachments';

const MB = 1024 * 1024;
function fakeFile(name: string, type: string, size: number): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

beforeEach(() => vi.clearAllMocks());

describe('validateAttachment (khớp backend chat-attachment-routes)', () => {
  it('ảnh jpeg/png/webp/gif <= 100MB hợp lệ; ảnh 101MB bị từ chối', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      expect(validateAttachment(fakeFile('a', t, 1 * MB))).toEqual({ ok: true, kind: 'image' });
    }
    expect(validateAttachment(fakeFile('to.jpg', 'image/jpeg', 101 * MB)).ok).toBe(false);
  });
  it('HEIC bị từ chối bằng lý do tiếng Việt, không gọi API', () => {
    const r = validateAttachment(fakeFile('IMG_1.HEIC', 'image/heic', 2 * MB));
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain('HEIC');
    expect(api.post).not.toHaveBeenCalled();
  });
  it('video mp4/mov/webm <= 500MB; video 600MB bị từ chối', () => {
    expect(validateAttachment(fakeFile('v.mp4', 'video/mp4', 500 * MB))).toEqual({ ok: true, kind: 'video' });
    expect(validateAttachment(fakeFile('v.mov', 'video/quicktime', 10 * MB))).toMatchObject({ ok: true, kind: 'video' });
    expect(validateAttachment(fakeFile('v.mp4', 'video/mp4', 600 * MB)).ok).toBe(false);
  });
  it('tài liệu: giới hạn thực tế 500MB (cap multipart), không phải FILE_MAX 1GB', () => {
    expect(CHAT_ATTACHMENT_LIMITS.fileMax).toBe(500 * MB);
    expect(validateAttachment(fakeFile('a.pdf', 'application/pdf', 500 * MB))).toEqual({ ok: true, kind: 'file' });
    expect(validateAttachment(fakeFile('a.pdf', 'application/pdf', 600 * MB)).ok).toBe(false);
    expect(validateAttachment(fakeFile('a.zip', 'application/zip', 1 * MB)).ok).toBe(true);
  });
  it('mime lạ hoặc rỗng bị từ chối (backend trả 415 cho octet-stream)', () => {
    expect(validateAttachment(fakeFile('a.exe', 'application/x-msdownload', 1 * MB)).ok).toBe(false);
    expect(validateAttachment(fakeFile('a.bin', '', 1 * MB)).ok).toBe(false);
    expect(validateAttachment(fakeFile('a.bin', 'application/octet-stream', 1 * MB)).ok).toBe(false);
  });
});

describe('uploadChatAttachments', () => {
  it('POST /conversations/:id/attachments với FormData field "files" + header multipart (y desktop)', async () => {
    const a = new File(['1'], 'a.png', { type: 'image/png' });
    const b = new File(['2'], 'b.png', { type: 'image/png' });
    await uploadChatAttachments('conv-9', [a, b]);
    const [url, body, config] = (api.post as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/conversations/conv-9/attachments');
    expect((body as FormData).getAll('files').map(f => (f as File).name)).toEqual(['a.png', 'b.png']);
    expect((body as FormData).has('caption')).toBe(false);
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
  });
  it('caption tùy chọn; lỗi từ API được ném lại nguyên để caller toast', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ response: { status: 413 } });
    await expect(uploadChatAttachments('c', [new File(['1'], 'a.png', { type: 'image/png' })], { caption: 'chú thích' })).rejects.toMatchObject({ response: { status: 413 } });
    const body = (api.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(body.get('caption')).toBe('chú thích');
  });
});
