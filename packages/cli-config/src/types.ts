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
  /** Allow CLI upgrades to override package-manager minimum release age. */
  bypassMinReleaseAge?: boolean;
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
  /** The last looked-up user's name, with the id it belongs to, for `whoami --cached`. */
  cachedUser?: { id: string; username: string };
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
  /** `false` opts out of the native CLI. Honored for one more release. */
  useNativeBinary?: boolean;
  /** Ignored. Older releases chose the native CLI with it. */
  nativeBinaryAutoOptIn?: boolean;
  /**
   * `false` in a config the CLI created for a first-time user, until their
   * first successful interactive run. Configs from earlier releases don't set
   * it and count as used.
   */
  usedBefore?: boolean;
}
