import type { ProjectEnvType } from '@vercel-internals/types';

// Keep these heuristics aligned with the dashboard's secret-key-detection.ts.
const SERVER_ONLY_KEY_PATTERNS = [
  'access_token',
  'refresh_token',
  'client_secret',
  'webhook_secret',
  'api_key',
  'private_key',
  'service_account',
  'service_role',
  'database_url',
  'database_uri',
  'db_url',
  'postgres_url',
  'postgres_uri',
  'mysql_url',
  'mongo_url',
  'mongo_uri',
  'redis_url',
  'redis_uri',
  'amqp_url',
  'kafka_url',
  'elasticsearch_url',
  'password',
  'passwd',
  'pwd',
  'secret',
  'private',
  'key',
  'apikey',
  'auth',
  'token',
  'jwt',
  'signature',
  'cert',
  'pem',
  'salt',
  'bearer',
  'credential',
  'credentials',
  'creds',
] as const;

const SAFE_KEY_HINT_TOKENS = ['public', 'publishable', 'anon'];

const WELL_KNOWN_SECRET_NAMES = new Set([
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'POSTGRES_URL_NO_SSL',
  'POSTGRES_URL_UNPOOLED',
  'POSTGRES_PRISMA_URL',
  'MONGODB_URI',
  'MONGODB_URL',
  'MONGO_URI',
  'MONGO_URL',
  'MYSQL_URL',
  'MYSQL_URI',
  'REDIS_URL',
  'REDIS_TLS_URL',
  'KV_URL',
  'KV_REST_API_URL',
  'UPSTASH_REDIS_REST_URL',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'AWS_ACCESS_KEY_ID',
]);

const SECRET_SEGMENT_PATTERN =
  /(?:^|[_-])(SECRET|PASSWORD|PASSWD|PASSPHRASE|PWD|PGPASSWORD|TOKEN|CREDENTIAL|JWT|DSN|APIKEY|PRIVATEKEY|SALT|PEPPER|MNEMONIC|PEM|CIPHER)S?(?:[_-]|$)/i;
const EXPLICIT_SECRET_TOKEN_PATTERN =
  /(?:^|[_-])(SECRET|PASSWORD|PASSWD|PASSPHRASE|PWD|PGPASSWORD|TOKEN|CREDENTIAL|MNEMONIC|PRIVATEKEY|APIKEY)S?(?:[_-]|$)/i;
const SECRET_COMPOUND_PATTERNS = [
  /(?:^|[_-])(?:API|PRIVATE|SIGNING|ENCRYPTION|SESSION|COOKIE|CSRF|HMAC|ACCESS|APP|WRITE)[_-]?(?:KEY|SECRET)S?(?:[_-]|$)/i,
  /(?:^|[_-])(?:ACCESS|REFRESH|BEARER|AUTH)[_-]?TOKENS?(?:[_-]|$)/i,
  /(?:^|[_-])(?:WEBHOOK|SIGNING)[_-]?SECRETS?(?:[_-]|$)/i,
  /(?:^|[_-])SERVICE[_-]?(?:ROLE(?:[_-]?KEYS?)?|ACCOUNTS?)(?:[_-]|$)/i,
];
const NON_CREDENTIAL_KEY_TOKENS = new Set([
  'PUBLIC',
  'PUBLISHABLE',
  'ANON',
  'PRIMARY',
  'PARTITION',
  'FOREIGN',
  'SORT',
  'HASH',
  'COMPOSITE',
  'INDEX',
  'UNIQUE',
  'NATURAL',
  'SURROGATE',
  'CACHE',
  'IDEMPOTENCY',
  'LOOKUP',
  'ROW',
  'SHARD',
  'CLUSTER',
  'LICENSE',
  'LICENCE',
  'PRODUCT',
  'TRANSLATION',
  'TRANSLATIONS',
  'I18N',
  'LOCALE',
  'RBAC',
  'ACL',
  'ROLE',
  'ROLES',
  'PERMISSION',
  'PERMISSIONS',
  'SCOPE',
  'SCOPES',
  'POLICY',
  'POLICIES',
]);
const GENERIC_KEY_SUFFIX_PATTERN = /(?:^|[_-])([A-Z0-9]+)[_-]KEYS?$/i;
const DB_URL_PATTERN =
  /(?:^|_)(?:DATABASE|POSTGRES|MONGO|MONGODB|MYSQL|REDIS|NEON|PLANETSCALE|TURSO|RDS)(?:_[A-Z0-9_]*)?_(?:URL|URI)(?:_[A-Z0-9_]+)?$/i;

const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /gh[opsru]_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /glpat-[A-Za-z0-9_-]{20,}/,
  /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/,
  /whsec_[A-Za-z0-9]{20,}/,
  /xox[abprs]-[A-Za-z0-9-]{20,}/,
  /xapp-[A-Za-z0-9-]{20,}/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bAIza[A-Za-z0-9_-]{30,}/,
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}/,
  /\bsk-[A-Za-z0-9]{32,}\b/,
  /shp(?:at|ss|ca)_[a-fA-F0-9]{32}/,
  /npm_[A-Za-z0-9]{30,}/,
  /\bhf_[A-Za-z0-9]{30,}/,
  /nvapi-[A-Za-z0-9_-]{40,}/,
  /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/,
  /key-[a-f0-9]{32}/,
  /glsa_[A-Za-z0-9_]{32}_[a-f0-9]{8}/,
  /pscale_pw_[A-Za-z0-9_-]{20,}/,
  /\bre_[A-Za-z0-9_]{30,}/,
  /dop_v1_[a-f0-9]{64}/,
  /sntrys_[A-Za-z0-9_-]{30,}/,
  /FlyV1 [A-Za-z0-9_-]{20,}/,
  /AccountKey=[A-Za-z0-9+/]{40,}=*/,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY[A-Z0-9 ]*-----/,
  /-----BEGIN PGP MESSAGE-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/,
  /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[A-Za-z0-9_.%-]*:[^@\s/]+(?<!\.\.)@/,
  /\bBearer\s+[A-Za-z0-9_+=/.-]{20,}/i,
  /(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|auth)\s*[=:]\s*["']?[A-Za-z0-9_+=/.-]{12,}/i,
];

function tokenize(key: string): Set<string> {
  return new Set(
    key
      .split(/(?<=[a-z])(?=[A-Z])/)
      .flatMap(part => part.split(/[_\-.]+/))
      .map(token => token.toLowerCase())
      .filter(Boolean)
  );
}

function hasSafeKeyHint(key: string): boolean {
  const tokens = tokenize(key);
  return SAFE_KEY_HINT_TOKENS.some(token => tokens.has(token));
}

function hasGenericKeySuffix(key: string): boolean {
  const precedingToken =
    GENERIC_KEY_SUFFIX_PATTERN.exec(key)?.[1]?.toUpperCase();
  return Boolean(
    precedingToken && !NON_CREDENTIAL_KEY_TOKENS.has(precedingToken)
  );
}

export function getMatchingServerOnlyKey(key: string): string | null {
  const normalized = key
    .replace(/(?<=[a-z])(?=[A-Z])/g, '_')
    .toLowerCase()
    .replace(/[-.]+/g, '_');
  for (const pattern of SERVER_ONLY_KEY_PATTERNS) {
    if (pattern.includes('_') && normalized.includes(pattern)) return pattern;
  }
  const tokens = tokenize(key);
  return (
    SERVER_ONLY_KEY_PATTERNS.find(
      pattern => !pattern.includes('_') && tokens.has(pattern)
    ) ?? null
  );
}

export function looksLikeSecret(key: string): boolean {
  if (!key || hasSafeKeyHint(key)) return false;
  if (WELL_KNOWN_SECRET_NAMES.has(key.toUpperCase())) return true;
  if (SECRET_SEGMENT_PATTERN.test(key)) return true;
  if (SECRET_COMPOUND_PATTERNS.some(pattern => pattern.test(key))) return true;
  if (DB_URL_PATTERN.test(key)) return true;
  return hasGenericKeySuffix(key);
}

export function looksLikeSecretValue(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(
    trimmed && SECRET_VALUE_PATTERNS.some(pattern => pattern.test(trimmed))
  );
}

export function shouldConfirmRotationBeforeDelete(env: {
  key: string;
  type: ProjectEnvType;
  hasPublicPrefix: boolean;
}): boolean {
  if (env.type === 'system') return false;
  if (EXPLICIT_SECRET_TOKEN_PATTERN.test(env.key)) return true;
  if (env.hasPublicPrefix || hasSafeKeyHint(env.key)) return false;
  return looksLikeSecret(env.key);
}

export function isFlagsSecretNeedingSplit(env: {
  key: string;
  type: ProjectEnvType;
  targets: string[];
  customEnvironmentIds?: string[];
}): boolean {
  if (env.key !== 'FLAGS_SECRET') return false;
  if (env.type !== 'plain' && env.type !== 'encrypted') return false;
  return env.targets.length + (env.customEnvironmentIds?.length ?? 0) > 1;
}
