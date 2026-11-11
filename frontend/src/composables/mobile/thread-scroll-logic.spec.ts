import { describe, expect, it } from 'vitest';
import { classifyMessageChange, decideScroll, isNearBottom, snapshotMessages, NEAR_BOTTOM_PX } from './thread-scroll-logic';

const ids = (...a: string[]) => a.map(id => ({ id }));

describe('isNearBottom', () => {
  it('gần đáy khi cách đáy <= 120px', () => {
    expect(NEAR_BOTTOM_PX).toBe(120);
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 480, clientHeight: 400 })).toBe(true); // 120
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 479, clientHeight: 400 })).toBe(false); // 121
  });
});

describe('classifyMessageChange', () => {
  const prev = snapshotMessages('A', ids('1', '2', '3'));

  it('tin mới ở cuối -> append kèm số tin thêm', () => {
    const list = ids('1', '2', '3', '4', '5');
    expect(classifyMessageChange(prev, snapshotMessages('A', list), list)).toEqual({ kind: 'append', added: 2 });
  });
  it('lịch sử cũ chèn ở đầu -> prepend (giữ anchor)', () => {
    const list = ids('0', '1', '2', '3');
    expect(classifyMessageChange(prev, snapshotMessages('A', list), list)).toEqual({ kind: 'prepend' });
  });
  it('đổi hội thoại hoặc từ rỗng -> reset', () => {
    const list = ids('1', '2', '3');
    expect(classifyMessageChange(prev, snapshotMessages('B', list), list)).toEqual({ kind: 'reset' });
    expect(classifyMessageChange(snapshotMessages('A', []), snapshotMessages('A', list), list)).toEqual({ kind: 'reset' });
  });
  it('tin cuối cũ biến mất (thay cả danh sách) -> reset', () => {
    const list = ids('x', 'y');
    expect(classifyMessageChange(prev, snapshotMessages('A', list), list)).toEqual({ kind: 'reset' });
  });
  it('xóa bớt tin ở đầu hoặc không đổi -> none (không cuộn)', () => {
    const list = ids('2', '3');
    expect(classifyMessageChange(prev, snapshotMessages('A', list), list)).toEqual({ kind: 'none' });
    expect(classifyMessageChange(prev, prev, ids('1', '2', '3'))).toEqual({ kind: 'none' });
  });
});

describe('decideScroll', () => {
  it('append: gần đáy hoặc tin mình vừa gửi -> bottom; đang đọc cũ -> pill', () => {
    const change = { kind: 'append', added: 1 } as const;
    expect(decideScroll({ change, stickToBottom: true, ownJustSent: false })).toBe('bottom');
    expect(decideScroll({ change, stickToBottom: false, ownJustSent: true })).toBe('bottom');
    expect(decideScroll({ change, stickToBottom: false, ownJustSent: false })).toBe('pill');
  });
  it('reset -> bottom; prepend -> anchor; none -> none', () => {
    expect(decideScroll({ change: { kind: 'reset' }, stickToBottom: false, ownJustSent: false })).toBe('bottom');
    expect(decideScroll({ change: { kind: 'prepend' }, stickToBottom: true, ownJustSent: false })).toBe('anchor');
    expect(decideScroll({ change: { kind: 'none' }, stickToBottom: true, ownJustSent: false })).toBe('none');
  });
});
