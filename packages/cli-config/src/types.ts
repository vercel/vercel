/**
 * Pure TypeScript interface definitions for Vercel global config types.
 *
 * These interfaces serve as the source of truth for types.
 * Zod schemas are generated from these using ts-to-zod.
 */

export interface TelemetryConfig {
  enabled?: boolean;
}

export interface GuidanceConfig {
  enabled?: boolean;
}

export interface UpdatesConfig {
  auto?: boolean;
}

export interface AuthConfig {
  '// Note'?: string;
  '// Docs'?: string;
  skipWrite?: boolean;
  token?: string;
  userId?: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenSource?: 'flag' | 'env';
}

export interface GlobalConfig {
  '// Note'?: string;
  '// Docs'?: string;
  currentTeam?: string;
  api?: string;
  telemetry?: TelemetryConfig;
  guidance?: GuidanceConfig;
  updates?: UpdatesConfig;
}
