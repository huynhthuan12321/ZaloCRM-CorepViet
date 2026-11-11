// So pixel hai ảnh PNG không cần thư viện ngoài: giải mã + so sánh trong trang trình duyệt (canvas).
import type { Browser } from '@playwright/test';

export interface PixelDiffResult {
  width: number;
  height: number;
  sizeMatch: boolean;
  totalPixels: number;
  diffPixels: number; // số pixel có chênh lệch kênh bất kỳ > threshold
  diffRatio: number;
  exactDiffPixels: number; // số pixel khác nhau bất kỳ (threshold 0)
  maxChannelDelta: number;
  diffPngBase64: string | null; // ảnh đánh dấu pixel khác (đỏ) trên nền mờ, null nếu không khác
}

export async function pixelDiff(browser: Browser, a: Buffer, b: Buffer, threshold = 8): Promise<PixelDiffResult> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.setContent('<canvas id="c"></canvas>');
    return await page.evaluate(
      async ({ a64, b64, threshold }) => {
        const load = async (b64s: string) => {
          const blob = await (await fetch(`data:image/png;base64,${b64s}`)).blob();
          const bmp = await createImageBitmap(blob);
          const c = document.createElement('canvas');
          c.width = bmp.width;
          c.height = bmp.height;
          const g = c.getContext('2d')!;
          g.drawImage(bmp, 0, 0);
          return { w: bmp.width, h: bmp.height, data: g.getImageData(0, 0, bmp.width, bmp.height).data };
        };
        const A = await load(a64);
        const B = await load(b64);
        const w = Math.max(A.w, B.w);
        const h = Math.max(A.h, B.h);
        const out = document.createElement('canvas');
        out.width = w;
        out.height = h;
        const og = out.getContext('2d')!;
        const od = og.createImageData(w, h);
        let diff = 0;
        let exact = 0;
        let maxDelta = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            const inA = x < A.w && y < A.h;
            const inB = x < B.w && y < B.h;
            let d = 0;
            if (inA && inB) {
              const ia = (y * A.w + x) * 4;
              const ib = (y * B.w + x) * 4;
              for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(A.data[ia + k] - B.data[ib + k]));
              od.data[o] = od.data[o + 1] = od.data[o + 2] = A.data[ia] >> 1 | 128;
              od.data[o + 3] = 255;
            } else {
              d = 255;
            }
            if (d > 0) exact++;
            if (d > maxDelta) maxDelta = d;
            if (d > threshold) {
              diff++;
              od.data[o] = 255;
              od.data[o + 1] = 0;
              od.data[o + 2] = 0;
              od.data[o + 3] = 255;
            }
          }
        }
        og.putImageData(od, 0, 0);
        const png = diff > 0 || exact > 0 ? out.toDataURL('image/png').split(',')[1] : null;
        return {
          width: w, height: h, sizeMatch: A.w === B.w && A.h === B.h, totalPixels: w * h,
          diffPixels: diff, diffRatio: diff / (w * h), exactDiffPixels: exact, maxChannelDelta: maxDelta, diffPngBase64: png,
        };
      },
      { a64: a.toString('base64'), b64: b.toString('base64'), threshold },
    );
  } finally {
    await ctx.close();
  }
}
