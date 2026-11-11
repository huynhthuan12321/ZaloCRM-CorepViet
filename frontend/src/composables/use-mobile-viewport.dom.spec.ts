// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';

// Module giữ state singleton -> mỗi case import module mới.
class FakeVisualViewport extends EventTarget {
  height = 800;
  width = 390;
  offsetTop = 0;
  scale = 1;
}

let vv: FakeVisualViewport | undefined;
const addSpy = vi.fn();
const removeSpy = vi.fn();

function flushFrame() {
  vi.advanceTimersByTime(20);
}

function setVisualViewport(value: FakeVisualViewport | undefined) {
  Object.defineProperty(window, 'visualViewport', { value, configurable: true, writable: true });
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  addSpy.mockClear();
  removeSpy.mockClear();
  vv = undefined;
  setVisualViewport(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setVisualViewport(undefined);
  document.body.innerHTML = '';
});

describe('useMobileViewport', () => {
  it('không có visualViewport -> --m-app-height = 100dvh, bàn phím coi như đóng', async () => {
    const { useMobileViewport } = await import('./use-mobile-viewport');
    const scope = effectScope();
    const vp = scope.run(() => useMobileViewport())!;
    expect(vp.supported.value).toBe(false);
    expect(vp.cssVars.value['--m-app-height']).toBe('100dvh');
    expect(vp.keyboardInset.value).toBe(0);
    expect(vp.keyboardOpen.value).toBe(false);
    expect(vp.orientation.value).toBe('portrait');
    scope.stop();
  });

  it('có visualViewport -> chiều cao = vv.height, inset bàn phím tính từ innerHeight', async () => {
    vv = new FakeVisualViewport();
    vv.height = 480; // bàn phím ~320px
    setVisualViewport(vv);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const { useMobileViewport } = await import('./use-mobile-viewport');
    const scope = effectScope();
    const vp = scope.run(() => useMobileViewport())!;
    expect(vp.supported.value).toBe(true);
    expect(vp.cssVars.value['--m-app-height']).toBe('480px');
    expect(vp.keyboardInset.value).toBe(320);
    expect(vp.keyboardOpen.value).toBe(true);
    expect(vp.cssVars.value['--m-keyboard-inset']).toBe('320px');
    scope.stop();
  });

  it('thanh công cụ Safari co giãn (inset < ngưỡng) hoặc không focus ô nhập -> keyboardOpen = false', async () => {
    vv = new FakeVisualViewport();
    vv.height = 740; // inset 60 < 120
    setVisualViewport(vv);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const { useMobileViewport } = await import('./use-mobile-viewport');
    const scope = effectScope();
    const vp = scope.run(() => useMobileViewport())!;
    expect(vp.keyboardInset.value).toBe(60);
    expect(vp.keyboardOpen.value).toBe(false);

    vv.height = 480;
    input.blur();
    vv.dispatchEvent(new Event('resize'));
    flushFrame();
    expect(vp.keyboardInset.value).toBe(320);
    expect(vp.keyboardOpen.value).toBe(false); // bàn phím giả nhưng không có ô nhập đang focus
    scope.stop();
  });

  it('visualViewport resize -> cập nhật gộp theo frame; offsetTop đi vào css var', async () => {
    vv = new FakeVisualViewport();
    setVisualViewport(vv);
    const { useMobileViewport } = await import('./use-mobile-viewport');
    const scope = effectScope();
    const vp = scope.run(() => useMobileViewport())!;
    expect(vp.cssVars.value['--m-app-height']).toBe('800px');
    vv.height = 500;
    vv.offsetTop = 40;
    vv.dispatchEvent(new Event('resize'));
    vv.dispatchEvent(new Event('scroll'));
    expect(vp.viewportHeight.value).toBe(800); // chưa qua frame
    flushFrame();
    expect(vp.viewportHeight.value).toBe(500);
    expect(vp.offsetTop.value).toBe(40);
    expect(vp.cssVars.value['--m-vv-offset-top']).toBe('40px');
    scope.stop();
  });

  it('pinch-zoom (scale > 1) không bị coi là bàn phím', async () => {
    vv = new FakeVisualViewport();
    vv.height = 400;
    vv.scale = 2;
    setVisualViewport(vv);
    const { useMobileViewport } = await import('./use-mobile-viewport');
    const scope = effectScope();
    const vp = scope.run(() => useMobileViewport())!;
    expect(vp.keyboardInset.value).toBe(0);
    expect(vp.viewportHeight.value).toBe(800);
    scope.stop();
  });

  it('orientation theo kích thước layout viewport khi không có screen.orientation', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 844, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 390, configurable: true });
    const { useMobileViewport } = await import('./use-mobile-viewport');
    const scope = effectScope();
    const vp = scope.run(() => useMobileViewport())!;
    expect(vp.orientation.value).toBe('landscape');
    scope.stop();
  });

  it('ref-count: listener chỉ gắn một lần và chỉ gỡ khi consumer cuối dispose', async () => {
    vv = new FakeVisualViewport();
    vi.spyOn(vv, 'addEventListener').mockImplementation(addSpy);
    vi.spyOn(vv, 'removeEventListener').mockImplementation(removeSpy);
    setVisualViewport(vv);
    const winAdd = vi.spyOn(window, 'addEventListener');
    const winRemove = vi.spyOn(window, 'removeEventListener');
    const { useMobileViewport } = await import('./use-mobile-viewport');

    const a = effectScope();
    const b = effectScope();
    a.run(() => useMobileViewport());
    b.run(() => useMobileViewport());
    expect(addSpy.mock.calls.map(c => c[0]).sort()).toEqual(['resize', 'scroll']);
    expect(winAdd.mock.calls.filter(c => c[0] === 'resize')).toHaveLength(1);

    a.stop();
    expect(removeSpy).not.toHaveBeenCalled();
    b.stop();
    expect(removeSpy.mock.calls.map(c => c[0]).sort()).toEqual(['resize', 'scroll']);
    expect(winRemove.mock.calls.filter(c => c[0] === 'resize')).toHaveLength(1);
    expect(winRemove.mock.calls.filter(c => c[0] === 'orientationchange')).toHaveLength(1);
  });

  it('sau khi dispose hết, event không còn cập nhật state và rAF đang chờ bị hủy', async () => {
    vv = new FakeVisualViewport();
    setVisualViewport(vv);
    const { useMobileViewport } = await import('./use-mobile-viewport');
    const scope = effectScope();
    const vp = scope.run(() => useMobileViewport())!;
    vv.height = 500;
    vv.dispatchEvent(new Event('resize')); // đang chờ frame
    scope.stop();
    flushFrame();
    expect(vp.viewportHeight.value).toBe(800);
    vv.height = 300;
    vv.dispatchEvent(new Event('resize'));
    flushFrame();
    expect(vp.viewportHeight.value).toBe(800);
  });
});

describe('useMobileViewport - giữ keyboardOpen thêm một frame khi đóng bàn phím', () => {
  it('inset về 0: frame đầu vẫn open, frame kế tiếp mới đóng; mở lại giữa chừng thì không nháy', async () => {
    vv = new FakeVisualViewport();
    vv.height = 480;
    setVisualViewport(vv);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const { useMobileViewport } = await import('./use-mobile-viewport');
    const scope = effectScope();
    const vp = scope.run(() => useMobileViewport())!;
    expect(vp.keyboardOpen.value).toBe(true);

    vv.height = 800;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(16); // frame đo đầu tiên
    expect(vp.keyboardInset.value).toBe(0);
    expect(vp.keyboardOpen.value).toBe(true); // còn giữ
    vi.advanceTimersByTime(16); // frame giữ thêm
    expect(vp.keyboardOpen.value).toBe(false);

    // bàn phím mở lại rồi đóng lần nữa vẫn đi qua một frame giữ
    vv.height = 480;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(16);
    expect(vp.keyboardOpen.value).toBe(true);
    vv.height = 800;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(16);
    expect(vp.keyboardOpen.value).toBe(true);
    vv.height = 480; // mở lại ngay trong frame giữ
    vi.advanceTimersByTime(16);
    expect(vp.keyboardOpen.value).toBe(true);
    scope.stop();
  });
});
