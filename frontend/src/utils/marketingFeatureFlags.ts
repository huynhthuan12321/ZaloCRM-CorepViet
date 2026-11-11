export type MarketingFeatureKey =
  | 'groupScan'
  | 'lists'
  | 'messageTemplates'
  | 'targets'
  | 'careSessions'
  | 'manualFollowup'
  | 'sequences'
  | 'contentBlocks'
  | 'broadcasts';

export type MarketingFeatureGate = Record<MarketingFeatureKey, boolean>;

export const MARKETING_FALLBACK_PATH = '/marketing/targets';

export const MARKETING_FEATURE_KEYS: MarketingFeatureKey[] = [
  'groupScan',
  'lists',
  'messageTemplates',
  'targets',
  'careSessions',
  'manualFollowup',
  'sequences',
  'contentBlocks',
  'broadcasts',
];

export const MARKETING_PATH_FEATURES: Array<[RegExp, MarketingFeatureKey]> = [
  [/^\/marketing\/group-scan(?:\/|$)/, 'groupScan'],
  [/^\/marketing\/lists(?:\/|$)/, 'lists'],
  [/^\/marketing\/message-templates(?:\/|$)/, 'messageTemplates'],
  [/^\/marketing\/templates(?:\/|$)/, 'messageTemplates'],
  [/^\/marketing\/targets(?:\/|$)/, 'targets'],
  [/^\/marketing\/goals(?:\/|$)/, 'targets'],
  [/^\/marketing\/triggers(?:\/|$)/, 'targets'],
  [/^\/marketing\/care-sessions(?:\/|$)/, 'careSessions'],
  [/^\/marketing\/manual-followup(?:\/|$)/, 'manualFollowup'],
  [/^\/marketing\/sequences(?:\/|$)/, 'sequences'],
  [/^\/marketing\/content-blocks(?:\/|$)/, 'contentBlocks'],
  [/^\/marketing\/blocks(?:\/|$)/, 'contentBlocks'],
  [/^\/marketing\/broadcasts(?:\/|$)/, 'broadcasts'],
];

const parseBoolean = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseDisabledFeatures = (): Set<MarketingFeatureKey> => {
  const raw = String(import.meta.env.VITE_MARKETING_DISABLED_FEATURES || '');
  const disabled = new Set<MarketingFeatureKey>();
  raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if ((MARKETING_FEATURE_KEYS as string[]).includes(item)) disabled.add(item as MarketingFeatureKey);
    });
  return disabled;
};

const disabledFeatures = parseDisabledFeatures();

// Mô hình OPT-OUT: mọi module Marketing BẬT mặc định (hướng "EE đầy đủ"). Tắt module
// cụ thể bằng VITE_MARKETING_DISABLED_FEATURES="careSessions,manualFollowup" (build-time).
export const marketingFeatureGate = MARKETING_FEATURE_KEYS.reduce((acc, key) => {
  acc[key] = !disabledFeatures.has(key);
  return acc;
}, {} as MarketingFeatureGate);

// Dry-run mặc định BẬT (an toàn — không gửi Zalo thật). Ưu tiên đọc VITE_MARKETING_DRY_RUN
// (biến Dockerfile/compose thực sự set); giữ 2 tên cũ làm alias để không vỡ cấu hình cũ.
export const marketingDryRunEnabled = parseBoolean(
  import.meta.env.VITE_MARKETING_DRY_RUN
    ?? import.meta.env.VITE_MARKETING_DRY_RUN_ENABLED
    ?? import.meta.env.VITE_MARKETING_BROADCAST_DRY_RUN,
  true,
);

export function getMarketingFeatureForPath(path: string): MarketingFeatureKey | null {
  const cleanPath = path.split('?')[0] || path;
  const match = MARKETING_PATH_FEATURES.find(([pattern]) => pattern.test(cleanPath));
  return match?.[1] ?? null;
}

export function isMarketingPathEnabled(path: string): boolean {
  const feature = getMarketingFeatureForPath(path);
  return feature ? marketingFeatureGate[feature] : true;
}

export function getMarketingFallbackPath(): string {
  // Chỉ liệt kê các đường ĐÃ có route thật (tránh redirect vào 404). Phiên chăm sóc +
  // Bám đuổi thủ công chưa có trang standalone (Nhóm B) nên KHÔNG đưa vào fallback.
  const priority: Array<[MarketingFeatureKey, string]> = [
    ['targets', '/marketing/targets'],
    ['sequences', '/marketing/sequences'],
    ['contentBlocks', '/marketing/content-blocks'],
    ['broadcasts', '/marketing/broadcasts'],
    ['lists', '/marketing/lists'],
    ['messageTemplates', '/marketing/message-templates'],
    ['groupScan', '/marketing/group-scan'],
  ];

  return priority.find(([feature]) => marketingFeatureGate[feature])?.[1] ?? '/marketing/group-scan';
}
