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
  updates?: UpdatesConfig;
  /**
   * Opt-in to running the native (compiled) Vercel CLI binary when a matching
   * `@vercel/vc-native-*` package is installed. When unset or `false`, the CLI
   * always runs as JavaScript even if a native binary is present. Members of
   * the `vercel` team are auto-opted-in; opt out with `vercel upgrade --binary false`.
   */
  useNativeBinary?: boolean;
}
