// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MOBILE_SESSION_RESET_EVENT } from '@/components/mobile/shell/shell-context';
import { __resetDesktopChatDraftsForTest, createDesktopChatDrafts, useDesktopChatDrafts } from './use-desktop-chat-drafts';

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'bold' }] }] }] });

beforeEach(() => __resetDesktopChatDraftsForTest());
afterEach(() => __resetDesktopChatDraftsForTest());

describe('use-desktop-chat-drafts (F4: RAM, theo conversationId)', () => {
  it('nháp A và B độc lập; xóa B không đụng A', () => {
    const d = createDesktopChatDrafts();
    d.setDoc('A', doc('a'));
    d.setDoc('B', doc('b'));
    d.clear('B');
    expect(d.getDoc('A')).toEqual(doc('a'));
    expect(d.getDoc('B')).toBeNull();
  });

  it('doc null xóa nháp; hội thoại chưa có nháp trả null (ô trống)', () => {
    const d = createDesktopChatDrafts();
    expect(d.getDoc('X')).toBeNull();
    d.setDoc('X', doc('x'));
    d.setDoc('X', null);
    expect(d.getDoc('X')).toBeNull();
    expect(d.hasAnyDraft()).toBe(false);
  });

  it('lưu bản sao bất biến: sửa doc gốc/bản đọc ra không làm đổi nháp', () => {
    const d = createDesktopChatDrafts();
    const src = doc('goc');
    d.setDoc('A', src);
    src.content[0].content![0].text = 'doi';
    const read = d.getDoc('A') as ReturnType<typeof doc>;
    read.content[0].content![0].text = 'doi-nua';
    expect(d.getDoc('A')).toEqual(doc('goc'));
  });

  it('giữ nguyên mark + mention + list trong tài liệu', () => {
    const d = createDesktopChatDrafts();
    const rich = { type: 'doc', content: [
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [
        { type: 'mention', attrs: { id: 'u1', label: 'An' } },
        { type: 'text', text: ' ok', marks: [{ type: 'zaloColor', attrs: { color: 'db342e' } }] },
      ] }] }] },
    ] };
    d.setDoc('A', rich);
    expect(d.getDoc('A')).toEqual(rich);
  });

  it('ngữ cảnh trả lời/sửa theo hội thoại; rỗng thì xóa', () => {
    const d = createDesktopChatDrafts();
    const m = { id: 'm1' };
    d.setContext('A', { replyingTo: m, editingMessage: null });
    expect(d.getContext('A').replyingTo).toEqual(m);
    expect(d.getContext('B')).toEqual({ replyingTo: null, editingMessage: null });
    d.setContext('A', { replyingTo: null, editingMessage: null });
    expect(d.getContext('A').replyingTo).toBeNull();
  });

  it('logout / đổi user / org (crm:mobile-session-reset) dọn toàn bộ RAM', () => {
    const d = useDesktopChatDrafts();
    d.setDoc('A', doc('a'));
    d.setContext('A', { replyingTo: { id: 'm' }, editingMessage: null });
    window.dispatchEvent(new CustomEvent(MOBILE_SESSION_RESET_EVENT, { detail: { previousUserId: 'u1', userId: null } }));
    expect(d.getDoc('A')).toBeNull();
    expect(d.getContext('A').replyingTo).toBeNull();
    expect(d.hasAnyDraft()).toBe(false);
  });
});
