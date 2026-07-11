import type { AiGatewayQuota } from './create-api-key';

export const VALID_REFRESH_PERIODS = [
  'daily',
  'weekly',
  'monthly',
  'none',
] as const;

export type RefreshPeriod = (typeof VALID_REFRESH_PERIODS)[number];

export function isValidRefreshPeriod(period: string): period is RefreshPeriod {
  return (VALID_REFRESH_PERIODS as readonly string[]).includes(period);
}

export function buildQuota(opts: {
  budget?: number;
  refreshPeriod?: string;
  includeByok?: boolean;
}): AiGatewayQuota | undefined {
  const effectiveRefresh =
    opts.refreshPeriod && opts.refreshPeriod !== 'none'
      ? opts.refreshPeriod
      : undefined;
  if (opts.budget === undefined && !effectiveRefresh && !opts.includeByok) {
    return undefined;
  }
  return {
    ...(opts.budget !== undefined && { limitAmount: opts.budget }),
    ...(effectiveRefresh && { refreshPeriod: effectiveRefresh }),
    ...(opts.includeByok && { includeByokInQuota: true }),
  };
}
