// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { StubBottomSheet, vuetifyStubs } from '@/__tests__/mobile/test-utils';
import { makeConversation } from '@/__tests__/mobile/fixtures';

import AttachmentSheet from './AttachmentSheet.vue';
import AISuggestionSheet from './AISuggestionSheet.vue';
import ConversationRow from './ConversationRow.vue';
import PendingQueueStrip from './PendingQueueStrip.vue';
import ThreadContextBar from './ThreadContextBar.vue';
import InboxFilterSheet from './InboxFilterSheet.vue';
import { ATTACHMENT_OPTIONS, describeUploadError } from './attachment-config';
import { attachmentLockReason, buildConversationContext, conversationPreview } from './conversation-model';
import type { ConversationContext } from './types';

const MB = 1024 * 1024;
const stubs = { VBottomSheet: StubBottomSheet, ...vuetifyStubs };
const zaloCtx = (over: Partial<ConversationContext> = {}): ConversationContext => ({
  nickName: 'Nick Bán Hàng 1', channelLabel: 'Zalo', ownerName: 'Lan', ownerExtra: 0,
  archivedNick: false, virtual: false, privateNick: false, isZalo: true, ...over,
});
function fakeFile(name: string, type: string, size = 1024): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}
async function pickFiles(w: ReturnType<typeof mountSheet>, kind: string, files: File[]) {
  const input = w.get(`input[type="file"][data-kind="${kind}"]`);
  Object.defineProperty(input.element, 'files', { value: files, configurable: true });
  await input.trigger('change');
}
function mountSheet(props: Record<string, unknown> = {}) {
  return mount(AttachmentSheet, {
    props: {
      open: true, conversationId: 'conv-A', currentConversationId: 'conv-A', customerName: 'Khách A',
      context: zaloCtx(), disabled: false, ...props,
    },
    global: { stubs },
  });
}

describe('conversation-model', () => {
  it('buildConversationContext: nick Zalo, người phụ trách, +N cùng chăm, không có TikTok', () => {
    const conv = makeConversation('A', 'Khách A');
    const ctx = buildConversationContext(conv);
    expect(ctx).toMatchObject({ nickName: 'Nick Bán Hàng 1', channelLabel: 'Zalo', ownerName: 'Lan Phụ Trách', ownerExtra: 2, isZalo: true });
    expect(JSON.stringify(ctx)).not.toMatch(/tiktok/i);
  });

  it('người phụ trách suy từ contactAccess primary khi list API chưa có assignedUser; thiếu hẳn -> null', () => {
    const conv = makeConversation('A', 'A');
    (conv.contact as unknown as Record<string, unknown>).assignedUser = undefined;
    expect(buildConversationContext(conv).ownerName).toBe('Lan Phụ Trách');
    (conv.contact as unknown as Record<string, unknown>).assignedUserId = null;
    (conv.contact as unknown as Record<string, unknown>).contactAccess = [];
    const bare = buildConversationContext(conv);
    expect(bare.ownerName).toBeNull();
    expect(bare.ownerExtra).toBe(0);
  });

  it('conversationPreview: media -> nhãn chữ, tin của mình có tiền tố "Bạn:"', () => {
    const conv = makeConversation('A', 'A', { messages: [{ content: '{"href":"x"}', contentType: 'image', senderType: 'self', sentAt: '', isDeleted: false }] });
    expect(conversationPreview(conv)).toBe('Bạn: Hình ảnh');
  });

  it('attachmentLockReason: offline, không phải Zalo, nick đã xóa, hội thoại ảo, đang gửi đều có lý do bằng chữ', () => {
    const base = { online: true, ctx: zaloCtx(), sending: false };
    expect(attachmentLockReason(base)).toBeNull();
    expect(attachmentLockReason({ ...base, online: false })).toContain('mất kết nối');
    expect(attachmentLockReason({ ...base, ctx: zaloCtx({ isZalo: false }) })).toContain('không phải Zalo');
    expect(attachmentLockReason({ ...base, ctx: zaloCtx({ archivedNick: true }) })).toContain('đã bị xóa');
    expect(attachmentLockReason({ ...base, ctx: zaloCtx({ virtual: true }) })).toContain('nội bộ');
    expect(attachmentLockReason({ ...base, sending: true })).toContain('Đang gửi');
  });
});

describe('ConversationRow', () => {
  it('luôn hiện nick + người phụ trách (+N), kênh bằng chữ, unread bằng số và chữ trong aria-label', () => {
    const conv = makeConversation('A', 'Khách A', { unreadCount: 3, isReplied: false });
    const w = mount(ConversationRow, { props: { conversation: conv, context: buildConversationContext(conv) }, global: { stubs } });
    const text = w.text();
    expect(text).toContain('Khách A');
    expect(text).toContain('Nick Nick Bán Hàng 1');
    expect(text).toContain('Phụ trách: Lan Phụ Trách (+2 cùng chăm)');
    expect(text).toContain('Zalo');
    expect(text).toContain('Chưa trả lời');
    expect(w.get('.m-conv-row__unread').text()).toBe('3');
    const aria = w.get('button').attributes('aria-label')!;
    expect(aria).toContain('3 tin chưa đọc');
    expect(aria).toContain('chưa trả lời');
    expect(text.toLowerCase()).not.toContain('tiktok');
  });

  it('chưa có người phụ trách -> "Chưa phân công"; preview riêng tư bị che; click phát select(convId)', async () => {
    const conv = makeConversation('B', 'Khách B');
    (conv.contact as unknown as Record<string, unknown>).assignedUser = null;
    (conv.contact as unknown as Record<string, unknown>).contactAccess = [];
    const w = mount(ConversationRow, { props: { conversation: conv, context: buildConversationContext(conv), blurPreview: true }, global: { stubs } });
    expect(w.text()).toContain('Chưa phân công');
    expect(w.text()).toContain('Nội dung riêng tư');
    await w.get('button').trigger('click');
    expect(w.emitted('select')).toEqual([['B']]);
  });
});

describe('ThreadContextBar', () => {
  it('hiện kênh + nick + người phụ trách + "+N cùng chăm"; cảnh báo nick đã xóa / chat nội bộ', () => {
    const w = mount(ThreadContextBar, { props: { context: zaloCtx({ ownerExtra: 2, archivedNick: true, virtual: true }) } });
    expect(w.text()).toContain('Zalo');
    expect(w.text()).toContain('Nick Bán Hàng 1');
    expect(w.text()).toContain('Phụ trách Lan');
    expect(w.text()).toContain('+2 cùng chăm');
    expect(w.text()).toContain('Nick đã xóa');
    expect(w.text()).toContain('Chat nội bộ');
  });
});

describe('AttachmentSheet (CONTRACT §3.3)', () => {
  it('mỗi lựa chọn có đúng accept/capture/multiple', () => {
    const w = mountSheet();
    const attr = (kind: string, name: string) => w.get(`input[data-kind="${kind}"]`).attributes(name);
    expect(attr('image', 'accept')).toBe('image/*');
    expect(attr('image', 'multiple')).toBeDefined();
    expect(attr('image', 'capture')).toBeUndefined();
    expect(attr('camera', 'accept')).toBe('image/*');
    expect(attr('camera', 'capture')).toBe('environment');
    expect(attr('camera', 'multiple')).toBeUndefined();
    expect(attr('video', 'accept')).toBe('video/mp4,video/quicktime,video/webm');
    expect(attr('video', 'multiple')).toBeUndefined(); // D-9: 1 video/lần
    expect(attr('document', 'accept')).toBe('.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.zip,.gz,.rar,.tar');
    expect(attr('document', 'multiple')).toBeDefined();
    expect(ATTACHMENT_OPTIONS.map(o => o.label)).toEqual(['Ảnh', 'Chụp ảnh', 'Video', 'Tài liệu', 'Kho media']);
    expect(w.text()).toContain('Gửi tới Khách A qua nick Nick Bán Hàng 1');
  });

  it('chọn ảnh hợp lệ -> phát pick kèm conversationId SNAPSHOT lúc mở sheet', async () => {
    const w = mountSheet();
    const png = fakeFile('a.png', 'image/png');
    await pickFiles(w, 'image', [png]);
    expect(w.emitted('pick')).toEqual([[{ kind: 'image', files: [png], conversationId: 'conv-A' }]]);
    expect(w.emitted('rejected')).toBeUndefined();
  });

  it('HEIC và video 600MB bị từ chối: phát rejected tiếng Việt, KHÔNG phát pick', async () => {
    const w = mountSheet();
    await pickFiles(w, 'image', [fakeFile('IMG_1.HEIC', 'image/heic')]);
    await pickFiles(w, 'video', [fakeFile('big.mp4', 'video/mp4', 600 * MB)]);
    expect(w.emitted('pick')).toBeUndefined();
    const reasons = (w.emitted('rejected') as string[][][]).flat(2);
    expect(reasons.join(' ')).toContain('HEIC');
    expect(reasons.join(' ')).toContain('quá lớn');
  });

  it('mục lẫn lộn: ảnh hợp lệ + HEIC -> chỉ ảnh hợp lệ được gửi, HEIC báo lý do', async () => {
    const w = mountSheet();
    const ok = fakeFile('ok.jpg', 'image/jpeg');
    await pickFiles(w, 'image', [ok, fakeFile('x.heic', 'image/heic')]);
    expect((w.emitted('pick') as Array<[{ files: File[] }]>)[0][0].files).toEqual([ok]);
    expect(w.emitted('rejected')).toHaveLength(1);
  });

  it('video chỉ nhận 1 tệp mỗi lần; tài liệu sai loại ở mục Ảnh bị từ chối', async () => {
    const w = mountSheet();
    const v1 = fakeFile('1.mp4', 'video/mp4');
    await pickFiles(w, 'video', [v1, fakeFile('2.mp4', 'video/mp4')]);
    expect((w.emitted('pick') as Array<[{ files: File[] }]>)[0][0].files).toEqual([v1]);
    await pickFiles(w, 'image', [fakeFile('a.pdf', 'application/pdf')]);
    expect(w.emitted('pick')).toHaveLength(1);
  });

  it('đổi hội thoại khi sheet đang mở -> tự đóng và KHÔNG upload (không phát pick)', async () => {
    const w = mountSheet();
    await w.setProps({ currentConversationId: 'conv-B' });
    expect(w.emitted('update:open')).toEqual([[false]]);
    await pickFiles(w, 'image', [fakeFile('a.png', 'image/png')]);
    expect(w.emitted('pick')).toBeUndefined();
    expect((w.emitted('rejected') as string[][][]).flat(2).join(' ')).toContain('Đã đổi sang khách khác');
  });

  it('khóa (offline/nick xóa/ảo/không phải Zalo): nút bị disable, hiện lý do bằng chữ, không phát gì', async () => {
    const w = mountSheet({ disabled: true, disabledReason: 'Đang mất kết nối. Ảnh và tệp không xếp hàng chờ.' });
    expect(w.text()).toContain('Đang mất kết nối');
    const buttons = w.findAll('button.m-attach__item');
    expect(buttons).toHaveLength(5);
    expect(buttons.every(b => b.attributes('disabled') !== undefined)).toBe(true);
    await pickFiles(w, 'image', [fakeFile('a.png', 'image/png')]);
    expect(w.emitted('pick')).toBeUndefined();
  });

  it('Kho media phát openLibrary kèm convId snapshot', async () => {
    const w = mountSheet();
    await w.get('button[data-kind="library"]').trigger('click');
    expect(w.emitted('openLibrary')).toEqual([['conv-A']]);
  });

  it('rào 6: đính kèm / Kho media không xếp hàng - khi offline sheet khóa toàn bộ và không có đường pick', async () => {
    const reason = attachmentLockReason({ online: false, ctx: zaloCtx(), sending: false });
    expect(reason).toBeTruthy();
    const w = mountSheet({ disabled: true, disabledReason: reason });
    await w.get('button[data-kind="library"]').trigger('click');
    expect(w.emitted('openLibrary')).toBeUndefined();
    const { useOfflineQueue } = await import('@/composables/use-offline-queue');
    // API hàng đợi chỉ nhận (conversationId, content) văn bản - không có chỗ nào cho tệp.
    expect(useOfflineQueue.length).toBe(0);
  });
});

// MediaLibrarySheet (F2: lưới mobile + đích cố định) được kiểm ở components/mobile/media/media-library.dom.spec.ts.

describe('describeUploadError (403/409/413/415/429 tiếng Việt)', () => {
  const e = (status?: number, data: Record<string, string> = {}) => ({ response: status ? { status, data } : undefined });
  it.each([
    [403, { code: 'PRIVACY_LOCKED' }, 'Riêng tư'],
    [403, {}, 'không có quyền'],
    [409, {}, 'đã bị xóa'],
    [413, {}, 'quá lớn'],
    [415, {}, 'chưa được hỗ trợ'],
    [429, {}, 'quá nhanh'],
  ])('%s %j -> chứa "%s"', (status, data, expected) => {
    expect(describeUploadError(e(status as number, data as Record<string, string>))).toContain(expected);
  });
  it('không có response (mất mạng/timeout) -> thông báo mạng', () => {
    expect(describeUploadError(e())).toContain('Mất kết nối');
  });
});

describe('AISuggestionSheet (CONTRACT §3.2): chỉ Áp vào nháp, không có đường gửi', () => {
  const base = { open: true, conversationId: 'conv-A', suggestion: 'Dạ em gửi anh báo giá ạ', sources: ['Bảng giá 2026'], loading: false, error: '', needsReviewReason: '', enabled: true, remaining: 10, currentDraft: '' };
  const mountAi = (props: Record<string, unknown> = {}) => mount(AISuggestionSheet, { props: { ...base, ...props }, global: { stubs } });

  it('không có nút/emit "gửi"; nháp rỗng -> "Áp vào nháp" phát applyDraft(replace) kèm conversationId', async () => {
    const w = mountAi();
    expect(w.text()).not.toMatch(/Gửi$/m);
    expect(w.findAll('button').some(b => /^gửi\b/i.test(b.text()))).toBe(false);
    await w.get('[data-action="apply"]').trigger('click');
    expect(w.emitted('applyDraft')).toEqual([[{ conversationId: 'conv-A', text: 'Dạ em gửi anh báo giá ạ', mode: 'replace' }]]);
    expect(Object.keys(w.emitted()).some(k => /send/i.test(k))).toBe(false);
  });

  it('nháp đang có chữ -> hiện hai lựa chọn Chèn vào cuối / Thay nháp', async () => {
    const w = mountAi({ currentDraft: 'em chào anh' });
    expect(w.get('[data-action="apply"]').text()).toBe('Thay nháp hiện tại');
    await w.get('[data-action="append"]').trigger('click');
    expect((w.emitted('applyDraft') as Array<[{ mode: string }]>)[0][0].mode).toBe('append');
  });

  it('hiện nguồn, cảnh báo cần duyệt, lỗi và trạng thái hết lượt', () => {
    expect(mountAi({ needsReviewReason: 'Khách hỏi giá cọc' }).text()).toContain('Khách hỏi giá cọc');
    expect(mountAi().text()).toContain('Bảng giá 2026');
    const noAi = mountAi({ enabled: false, suggestion: '', remaining: 0 });
    expect(noAi.text()).toContain('hết lượt');
    expect(noAi.get('button.m-ai__btn--primary').attributes('disabled')).toBeDefined();
  });

  it('chưa có gợi ý -> nút "Nhờ AI gợi ý" phát ask; không tự phát applyDraft', async () => {
    const w = mountAi({ suggestion: '' });
    await w.get('button.m-ai__btn--primary').trigger('click');
    expect(w.emitted('ask')).toHaveLength(1);
    expect(w.emitted('applyDraft')).toBeUndefined();
  });
});

describe('PendingQueueStrip (rào 5)', () => {
  it('rào 5: tin chờ gửi hiện nhãn "Đang chờ gửi" + nút Hủy', async () => {
    const w = mount(PendingQueueStrip, { props: { items: [{ id: 'p1', content: 'báo giá nhé', state: 'waiting' }], online: false } });
    expect(w.text()).toContain('báo giá nhé');
    expect(w.text()).toContain('Đang chờ gửi');
    await w.get('[data-action="cancel"]').trigger('click');
    expect(w.emitted('cancel')).toEqual([['p1']]);
    expect(w.find('[data-action="resend"]').exists()).toBe(false);
  });

  it('rào 5: mục quá hạn/lỗi hiện "Chưa gửi" + Gửi lại / Xóa; Gửi lại disable khi offline', async () => {
    const offline = mount(PendingQueueStrip, { props: { items: [{ id: 'p2', content: 'cũ', state: 'unsent' }], online: false } });
    expect(offline.text()).toContain('Chưa gửi');
    expect(offline.get('[data-action="resend"]').attributes('disabled')).toBeDefined();
    const online = mount(PendingQueueStrip, { props: { items: [{ id: 'p2', content: 'cũ', state: 'unsent' }], online: true } });
    await online.get('[data-action="resend"]').trigger('click');
    await online.get('[data-action="delete"]').trigger('click');
    expect(online.emitted('resend')).toEqual([['p2']]);
    expect(online.emitted('cancel')).toEqual([['p2']]);
  });

  it('không có mục thì không render gì', () => {
    expect(mount(PendingQueueStrip, { props: { items: [], online: true } }).find('ul').exists()).toBe(false);
  });
});

describe('InboxFilterSheet (hai pha Áp dụng / Xóa)', () => {
  beforeEach(() => vi.clearAllMocks());
  it('chọn trong nháp nội bộ, chỉ khi bấm Áp dụng mới phát apply; Xóa phát clear', async () => {
    const w = mount(InboxFilterSheet, {
      props: { open: true, filters: { unread: false, unreplied: false, mine: false, accountId: null }, accounts: [{ id: 'n1', displayName: 'Nick 1' }] },
      global: { stubs },
    });
    await w.findAll('input[type="checkbox"]')[0].setValue(true); // Chưa trả lời
    expect(w.emitted('apply')).toBeUndefined();
    await w.get('[data-action="apply"]').trigger('click');
    expect(w.emitted('apply')).toEqual([[{ unread: false, unreplied: true, mine: false, accountId: null }]]);
    await w.get('[data-action="clear"]').trigger('click');
    await flushPromises();
    expect(w.emitted('clear')).toHaveLength(1);
  });
});

describe('vòng sửa C: ThreadContextBar compact, khóa riêng tư, cảnh báo có thể đã gửi', () => {
  it('compact: một dòng "Nick X · PT Y" (không ẩn hẳn signature)', () => {
    const w = mount(ThreadContextBar, { props: { context: zaloCtx({ ownerExtra: 2 }), compact: true } });
    expect(w.find('.m-ctx--compact').exists()).toBe(true);
    expect(w.text()).toContain('Nick Nick Bán Hàng 1');
    expect(w.text()).toContain('PT Lan');
    expect(w.text()).toContain('(+2)');
    const none = mount(ThreadContextBar, { props: { context: zaloCtx({ ownerName: null }), compact: true } });
    expect(none.text()).toContain('Chưa phân công');
  });

  it('attachmentLockReason: nick Riêng tư của người khác có lý do bằng chữ', () => {
    const base = { online: true, ctx: zaloCtx(), sending: false };
    expect(attachmentLockReason({ ...base, privacyLocked: true })).toContain('Riêng tư');
    expect(attachmentLockReason({ ...base, privacyLocked: false })).toBeNull();
  });

  it('PendingQueueStrip: mục maybeDelivered ghi "Có thể đã gửi — xem lại hội thoại trước khi gửi lại"', () => {
    const w = mount(PendingQueueStrip, { props: { online: true, items: [{ id: 'x', content: 'hi', state: 'unsent', maybeDelivered: true }] } });
    expect(w.text()).toContain('Có thể đã gửi — xem lại hội thoại trước khi gửi lại');
    const plain = mount(PendingQueueStrip, { props: { online: true, items: [{ id: 'y', content: 'hi', state: 'unsent' }] } });
    expect(plain.text()).toContain('Chưa gửi');
    expect(plain.text()).not.toContain('Có thể đã gửi');
  });
});
