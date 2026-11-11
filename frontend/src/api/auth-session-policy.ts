/** Session rejection is explicit server evidence, never a transport/availability failure. */
export function responseStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

export function isRefreshTokenRejected(error: unknown): boolean {
  const status = responseStatus(error);
  if (status === 401) return true;
  if (status !== 400) return false;
  const data = (error as { response?: { data?: { code?: string; error?: string; message?: string } } }).response?.data;
  if (['refresh_invalid', 'refresh_reuse', 'invalid_refresh_token', 'invalid_token'].includes(data?.code ?? '')) return true;
  return /(?:invalid|expired|revoked)\s+(?:refresh\s+)?token|(?:refresh\s+)?token.*(?:invalid|expired|revoked|không hợp lệ|hết hạn|thu hồi)/i.test(data?.error ?? data?.message ?? '');
}

export function isProfileSessionRejected(error: unknown): boolean {
  // Inspect the failing operation before interpreting a 403: refresh 403 is
  // not an explicit invalid-token response, unlike a direct profile 403.
  const url = (error as { config?: { url?: string } } | null)?.config?.url ?? '';
  if (url.includes('/auth/refresh')) return isRefreshTokenRejected(error);
  const status = responseStatus(error);
  return status === 401 || status === 403;
}
