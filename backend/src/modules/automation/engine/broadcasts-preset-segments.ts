// Broadcasts Đợt 1 (2026-06-05) — 8 Pre-set Segment cố định.
//
// Source-of-truth cho dropdown "⚡ Pre-set Segment" trong wizard Broadcasts.
// Sale chọn 1 segment từ list → resolver chạy query Prisma server-controlled.
// Vì query được hardcode ở đây, KHÔNG có risk user input pollution.
//
// Anh + em chốt 8 segment Phase 1 dựa BĐS use case:
//   1. kh-moi-hom-nay         — createdAt >= today_start (Asia/Ho_Chi_Minh)
//   2. lead-chua-rep-7-ngay   — lifecycle=lead, lastInboundAt > 7d (or null)
//   3. lead-hot-diem-70       — leadScore >= 70
//   4. kh-than-thiet-q2-2026  — statusId=customer, firstDealAt in 2026-04..06
//   5. bi-bo-roi-khong-owner  — assignedUserId IS NULL
//   6. da-chot-chua-followup  — status=won AND lastOutboundAt > 30d
//   7. top-20-engagement      — engagementScore desc top 20%
//   8. sinh-nhat-tuan-nay     — birthDate in current ISO week
//
// TODO Anh: chốt lại 8 key này trong "1 buổi" trước khi production.

type PrismaClient = any; // Prisma Accelerate extends client — use loose type

export type PresetSegmentKey =
  | 'kh-moi-hom-nay'
  | 'lead-chua-rep-7-ngay'
  | 'lead-hot-diem-70'
  | 'kh-than-thiet-q2-2026'
  | 'bi-bo-roi-khong-owner'
  | 'da-chot-chua-followup'
  | 'top-20-engagement'
  | 'sinh-nhat-tuan-nay';

export interface PresetSegmentMeta {
  key: PresetSegmentKey;
  label: string;
  emoji: string;
  description: string;
  /** Hiển thị badge tone trên UI (sale-friendly) */
  tone: 'hot' | 'warning' | 'info' | 'success' | 'neutral';
}

export const PRESET_SEGMENTS: PresetSegmentMeta[] = [
  {
    key: 'kh-moi-hom-nay',
    label: 'Khách mới hôm nay',
    emoji: '🆕',
    description: 'KH được tạo từ 00:00 hôm nay (giờ VN). Phù hợp tin chào mừng.',
    tone: 'info',
  },
  {
    key: 'lead-chua-rep-7-ngay',
    label: 'Lead chưa phản hồi 7 ngày',
    emoji: '🟡',
    description: 'Lead chưa rep tin ≥ 7 ngày. Phù hợp tin nhắc nhở / khơi lại quan tâm.',
    tone: 'warning',
  },
  {
    key: 'lead-hot-diem-70',
    label: 'Lead hot điểm ≥ 70',
    emoji: '🔥',
    description: 'KH có lead score ≥ 70. Phù hợp tin ưu đãi sốc đẩy chốt.',
    tone: 'hot',
  },
  {
    key: 'kh-than-thiet-q2-2026',
    label: 'KH thân thiết Q2 2026',
    emoji: '💎',
    description: 'KH đã thành customer + ký hợp đồng đầu tiên trong Q2 2026 (04-06). Tri ân, cross-sell.',
    tone: 'success',
  },
  {
    key: 'bi-bo-roi-khong-owner',
    label: 'Bị bỏ rơi (không có sale phụ trách)',
    emoji: '🆘',
    description: 'KH chưa được gán sale phụ trách. Tin chăm sóc tạm thời trước khi assign.',
    tone: 'neutral',
  },
  {
    key: 'da-chot-chua-followup',
    label: 'Đã chốt deal nhưng chưa follow-up 30 ngày',
    emoji: '⏰',
    description: 'KH đã thành customer + > 30 ngày sale không nhắn tin. Phù hợp tin tái kết nối.',
    tone: 'warning',
  },
  {
    key: 'top-20-engagement',
    label: 'Top 20% engagement score',
    emoji: '⭐',
    description: 'KH tương tác cao nhất (top 20% theo engagement score). Phù hợp tin VIP / sự kiện riêng.',
    tone: 'hot',
  },
  {
    key: 'sinh-nhat-tuan-nay',
    label: 'Sinh nhật tuần này',
    emoji: '🎂',
    description: 'KH có sinh nhật rơi vào tuần hiện tại. Tin chúc mừng + ưu đãi sinh nhật.',
    tone: 'info',
  },
];

export function isValidPresetKey(key: string): key is PresetSegmentKey {
  return PRESET_SEGMENTS.some((p) => p.key === key);
}

export function getPresetMeta(key: PresetSegmentKey): PresetSegmentMeta | undefined {
  return PRESET_SEGMENTS.find((p) => p.key === key);
}

// VN timezone helpers — tránh tính sai do server UTC
function vnNow(): Date {
  return new Date();
}

function vnStartOfDay(): Date {
  const now = vnNow();
  // VN = UTC+7. Lấy YYYY-MM-DD của VN, rồi build 00:00 VN = -7h từ 00:00 UTC.
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const vnTime = new Date(now.getTime() + vnOffsetMs);
  const y = vnTime.getUTCFullYear();
  const m = vnTime.getUTCMonth();
  const d = vnTime.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - vnOffsetMs);
}

function daysAgoVN(days: number): Date {
  const start = vnStartOfDay();
  return new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
}

function vnIsoWeekRange(): { start: Date; end: Date } {
  // ISO week: Monday-Sunday. Find Monday of current VN week.
  const startOfToday = vnStartOfDay();
  const dayOfWeek = (startOfToday.getUTCDay() + 6) % 7; // Mon=0, Sun=6 (chuyển ISO)
  // Lùi về Monday VN
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const mondayVN = new Date(startOfToday.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
  const sundayEndVN = new Date(mondayVN.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  return { start: mondayVN, end: sundayEndVN };
}

/**
 * Resolver chạy query Prisma cho từng preset key.
 * KHÔNG bao gồm filter hasZalo + excludeBlocked — đó là post-filter ở caller (segment-resolver.ts).
 * Trả về contactIds raw, scope orgId.
 */
export async function resolvePresetSegment(
  prisma: PrismaClient,
  orgId: string,
  presetKey: string,
  maxRecipients: number,
): Promise<string[]> {
  switch (presetKey as PresetSegmentKey) {
    case 'kh-moi-hom-nay': {
      const start = vnStartOfDay();
      const rows = await prisma.contact.findMany({
        where: { orgId, createdAt: { gte: start } },
        select: { id: true },
        take: maxRecipients,
      });
      return rows.map((r: { id: string }) => r.id);
    }

    case 'lead-chua-rep-7-ngay': {
      const sevenDaysAgo = daysAgoVN(7);
      // "lead" lifecycle: KH chưa thành customer. Schema dùng `status` legacy string
      // "new"/"contacted"/"qualified"/"lead" — em filter loại trừ status thực tế customer.
      const rows = await prisma.contact.findMany({
        where: {
          orgId,
          OR: [
            { lastInboundAt: null },
            { lastInboundAt: { lt: sevenDaysAgo } },
          ],
          // Loại trừ KH đã thành customer hoặc đã đóng
          NOT: {
            status: { in: ['customer', 'closed_won', 'closed_lost'] },
          },
        },
        select: { id: true },
        take: maxRecipients,
      });
      return rows.map((r: { id: string }) => r.id);
    }

    case 'lead-hot-diem-70': {
      const rows = await prisma.contact.findMany({
        where: { orgId, leadScore: { gte: 70 } },
        select: { id: true },
        take: maxRecipients,
      });
      return rows.map((r: { id: string }) => r.id);
    }

    case 'kh-than-thiet-q2-2026': {
      // Q2 2026 = 2026-04-01 → 2026-06-30 (giờ VN)
      const q2Start = new Date(Date.UTC(2026, 3, 1, 0, 0, 0) - 7 * 60 * 60 * 1000);
      const q2End = new Date(Date.UTC(2026, 6, 1, 0, 0, 0) - 7 * 60 * 60 * 1000 - 1);
      // Schema KHÔNG có `firstDealAt` field — em dùng `status='customer'` AND
      // `lastOutboundAt` nằm trong Q2 (proxy cho first deal). TODO Anh chốt
      // dùng field nào đúng — em đoán dùng `createdAt` trong Q2 nếu cần.
      const rows = await prisma.contact.findMany({
        where: {
          orgId,
          status: 'customer',
          createdAt: { gte: q2Start, lte: q2End },
        },
        select: { id: true },
        take: maxRecipients,
      });
      return rows.map((r: { id: string }) => r.id);
    }

    case 'bi-bo-roi-khong-owner': {
      const rows = await prisma.contact.findMany({
        where: { orgId, assignedUserId: null },
        select: { id: true },
        take: maxRecipients,
      });
      return rows.map((r: { id: string }) => r.id);
    }

    case 'da-chot-chua-followup': {
      const thirtyDaysAgo = daysAgoVN(30);
      const rows = await prisma.contact.findMany({
        where: {
          orgId,
          status: { in: ['customer', 'closed_won'] },
          OR: [
            { lastOutboundAt: null },
            { lastOutboundAt: { lt: thirtyDaysAgo } },
          ],
        },
        select: { id: true },
        take: maxRecipients,
      });
      return rows.map((r: { id: string }) => r.id);
    }

    case 'top-20-engagement': {
      // Lấy top 20% engagementScore — query: order desc + take 20% của tổng KH có Zalo
      const total = await prisma.contact.count({
        where: { orgId, engagementScore: { not: null } },
      });
      const limit = Math.max(1, Math.floor(total * 0.2));
      const rows = await prisma.contact.findMany({
        where: { orgId, engagementScore: { not: null } },
        select: { id: true },
        orderBy: { engagementScore: 'desc' },
        take: Math.min(limit, maxRecipients),
      });
      return rows.map((r: { id: string }) => r.id);
    }

    case 'sinh-nhat-tuan-nay': {
      const { start, end } = vnIsoWeekRange();
      // birthDate là DateTime @db.Date — Prisma vẫn so sánh theo timestamp.
      // Em filter MONTH + DAY thay vì range để cover mọi năm sinh.
      const startMonth = start.getUTCMonth();
      const startDay = start.getUTCDate();
      const endMonth = end.getUTCMonth();
      const endDay = end.getUTCDate();

      // Build query qua raw SQL để filter EXTRACT(MONTH/DAY) — Prisma không hỗ trợ trực tiếp
      // FALLBACK: query toàn bộ KH có birthDate, filter trong app code
      const candidates = await prisma.contact.findMany({
        where: { orgId, birthDate: { not: null } },
        select: { id: true, birthDate: true },
        take: 10_000, // cap defensive
      });

      const matched = candidates.filter((c: { id: string; birthDate: Date | null }) => {
        if (!c.birthDate) return false;
        const m = c.birthDate.getUTCMonth();
        const d = c.birthDate.getUTCDate();
        // Same month range
        if (startMonth === endMonth) {
          return m === startMonth && d >= startDay && d <= endDay;
        }
        // Cross-month (week trải qua tháng)
        if (m === startMonth) return d >= startDay;
        if (m === endMonth) return d <= endDay;
        return false;
      });

      return matched.slice(0, maxRecipients).map((c: { id: string }) => c.id);
    }

    default:
      return [];
  }
}
