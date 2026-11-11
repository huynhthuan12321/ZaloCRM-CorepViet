import { describe, expect, it } from 'vitest';
import { backDeltaToRoot, backActionFromDetail, backIsInSettings, isSettingsDetail, isSettingsRoot, needsEntryNormalize } from './settings-nav-model';

describe('phân cấp Cài đặt', () => {
  it('cấp 1 chỉ đúng /settings (cho phép / cuối, query, hash)', () => {
    expect(isSettingsRoot('/settings')).toBe(true);
    expect(isSettingsRoot('/settings/')).toBe(true);
    expect(isSettingsRoot('/settings?tab=users')).toBe(true);
    expect(isSettingsRoot('/settings/org/profile')).toBe(false);
    expect(isSettingsRoot('/settings-x')).toBe(false);
  });
  it('cấp 2 là /settings/**', () => {
    expect(isSettingsDetail('/settings/org/profile')).toBe(true);
    expect(isSettingsDetail('/settings/channels/zalo?tab=privacy')).toBe(true);
    expect(isSettingsDetail('/settings')).toBe(false);
    expect(isSettingsDetail('/account')).toBe(false);
  });
});

describe('chèn cấp 1 vào lịch sử khi vào cấp 2 (deep link / từ /account)', () => {
  it('cold start (back null) hoặc đến từ /account -> cần chuẩn hóa', () => {
    expect(needsEntryNormalize('/settings/org/profile', null)).toBe(true);
    expect(needsEntryNormalize('/settings/org/profile', undefined)).toBe(true);
    expect(needsEntryNormalize('/settings/org/profile', '/account')).toBe(true);
    expect(needsEntryNormalize('/settings/org/profile', '/chat/abc')).toBe(true);
  });
  it('đi từ cấp 1 hoặc giữa hai trang cấp 2 -> không chuẩn hóa', () => {
    expect(needsEntryNormalize('/settings/org/profile', '/settings')).toBe(false);
    expect(needsEntryNormalize('/settings/org/profile', '/settings/channels/zalo')).toBe(false);
  });
  it('ở cấp 1 không bao giờ chuẩn hóa', () => {
    expect(needsEntryNormalize('/settings', null)).toBe(false);
    expect(backIsInSettings('/account')).toBe(false);
  });
  it('nút quay lại header cấp 2: entry trước là cấp 1 -> back; ngược lại replace về danh sách', () => {
    expect(backActionFromDetail('/settings')).toBe('history-back');
    expect(backActionFromDetail('/settings/channels/zalo')).toBe('replace-root');
    expect(backActionFromDetail(null)).toBe('replace-root');
  });
});

describe('backDeltaToRoot', () => {
  it('lùi đúng số bước tới entry /settings; không rõ vị trí -> null (dùng replace)', () => {
    expect(backDeltaToRoot(3, 5)).toBe(-2);
    expect(backDeltaToRoot(3, 4)).toBe(-1);
    expect(backDeltaToRoot(null, 4)).toBeNull();
    expect(backDeltaToRoot(5, 5)).toBeNull();
  });
});
