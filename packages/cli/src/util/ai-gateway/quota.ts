import type { AiGatewayQuota } from './api-keys';

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

export const VALID_ALERT_THRESHOLDS = [50, 75, 100] as const;

export function parseAlertThresholds(
  input: string
): { valid: true; values: number[] } | { valid: false; invalid: string } {
  const values: number[] = [];
  const tokens = input
    .split(',')
    .map(token => token.trim())
    .filter(token => token.length > 0);
  for (const token of tokens) {
    const num = Number(token);
    if (
      !Number.isInteger(num) ||
      !(VALID_ALERT_THRESHOLDS as readonly number[]).includes(num)
    ) {
      return { valid: false, invalid: token };
    }
    if (!values.includes(num)) {
      values.push(num);
    }
  }
  return { valid: true, values };
}

export function buildQuota(opts: {
  budget?: number;
  refreshPeriod?: string;
  includeByok?: boolean;
  alertThresholds?: number[];
}): AiGatewayQuota | undefined {
  const effectiveRefresh =
    opts.refreshPeriod && opts.refreshPeriod !== 'none'
      ? opts.refreshPeriod
      : undefined;
  const hasAlertThresholds =
    opts.alertThresholds !== undefined && opts.alertThresholds.length > 0;
  if (
    opts.budget === undefined &&
    !effectiveRefresh &&
    !opts.includeByok &&
    !hasAlertThresholds
  ) {
    return undefined;
  }
  return {
    ...(opts.budget !== undefined && { limitAmount: opts.budget }),
    ...(effectiveRefresh && { refreshPeriod: effectiveRefresh }),
    ...(opts.includeByok && { includeByokInQuota: true }),
    ...(hasAlertThresholds && { alertThresholds: opts.alertThresholds }),
  };
}
