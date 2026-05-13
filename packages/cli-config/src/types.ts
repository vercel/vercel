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

export type CredStorage = 'auto' | 'file' | 'keyring';

export type CredentialsStorageLocation = Exclude<CredStorage, 'auto'>;

export const CRED_STORAGE_CONFIG_VALUES = [
  'auto',
  'file',
  'keyring',
] as const satisfies readonly CredStorage[];

export const CRED_STORAGE_VALUES = CRED_STORAGE_CONFIG_VALUES.filter(
  (storage): storage is Exclude<CredStorage, 'auto'> => storage !== 'auto'
);

export const DEFAULT_CRED_STORAGE: CredentialsStorageLocation = 'file';

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

export type AuthFileConfig = Omit<AuthConfig, 'tokenSource'>;

export interface GlobalConfig {
  '// Note'?: string;
  '// Docs'?: string;
  credStorage?: CredStorage;
  currentTeam?: string;
  api?: string;
  telemetry?: TelemetryConfig;
  guidance?: GuidanceConfig;
}
