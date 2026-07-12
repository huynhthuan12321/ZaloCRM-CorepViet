export type MarketingFeatureKey =
  | 'groupScan'
  | 'lists'
  | 'listDetail'
  | 'messageTemplates'
  | 'targets'
  | 'careSessions'
  | 'manualFollowup'
  | 'sequences'
  | 'contentBlocks'
  | 'broadcasts';

function envFlag(name: string, fallback = false): boolean {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  const raw = String(env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(raw);
}

export const marketingEnterpriseEnabled = envFlag('VITE_MARKETING_ENTERPRISE_ENABLED');
export const marketingBroadcastEnabled = marketingEnterpriseEnabled || envFlag('VITE_BROADCAST_ENABLED');
export const marketingSequenceEnabled = marketingEnterpriseEnabled || envFlag('VITE_SEQUENCE_ENABLED');
export const marketingDryRunEnabled = envFlag('VITE_MARKETING_DRY_RUN', true);

export const MARKETING_FALLBACK_PATH = '/marketing/lists';

export const marketingFeatureGate: Record<MarketingFeatureKey, boolean> = {
  groupScan: true,
  lists: true,
  listDetail: true,
  messageTemplates: true,
  targets: marketingEnterpriseEnabled,
  careSessions: marketingEnterpriseEnabled,
  manualFollowup: marketingEnterpriseEnabled,
  sequences: marketingSequenceEnabled,
  contentBlocks: marketingSequenceEnabled,
  broadcasts: marketingBroadcastEnabled,
};

const PATH_FEATURES: Array<[RegExp, MarketingFeatureKey]> = [
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

export function getMarketingFeatureForPath(path: string): MarketingFeatureKey | null {
  const normalized = path.split('?')[0] || '';
  return PATH_FEATURES.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
}

export function isMarketingPathEnabled(path: string): boolean {
  const feature = getMarketingFeatureForPath(path);
  return feature ? marketingFeatureGate[feature] : true;
}

export function getMarketingFallbackPath(): string {
  return MARKETING_FALLBACK_PATH;
}