import type Client from '../client';
import output from '../../output-manager';
import type { DatabaseRole } from '../../commands/db/types';

const DATABASE_ROLES = new Set<DatabaseRole>([
  'readonly',
  'readwrite',
  'admin',
]);

const MAX_SQL_LENGTH = 100_000;

export function parseDatabaseRole(role: string | undefined): DatabaseRole {
  if (!role) {
    return 'readonly';
  }
  if (DATABASE_ROLES.has(role as DatabaseRole)) {
    return role as DatabaseRole;
  }
  throw new Error('Invalid role. Use one of: readonly, readwrite, admin.');
}

export async function confirmProductionWrite(
  client: Client,
  opts: {
    environment: string;
    role: DatabaseRole;
    confirmed: boolean | undefined;
    reason?: string;
  }
): Promise<'confirmed' | 'canceled' | 'invalid'> {
  if (
    normalizeEnvironment(opts.environment) !== 'production' ||
    opts.role === 'readonly'
  ) {
    return 'confirmed';
  }

  if (!opts.reason?.trim()) {
    output.error('Production database write access requires --reason.');
    return 'invalid';
  }

  if (opts.confirmed) {
    return 'confirmed';
  }

  if (client.nonInteractive) {
    output.error(
      'Production database write access requires --confirm-production-write in non-interactive mode.'
    );
    return 'invalid';
  }

  return (await client.input.confirm(
    `Request ${opts.role} access to the production database?`,
    false
  ))
    ? 'confirmed'
    : 'canceled';
}

function normalizeEnvironment(environment: string): string {
  return environment.trim().toLowerCase();
}

export function assertSafeSqlInput(sql: string | undefined): string {
  const trimmed = sql?.trim();
  if (!trimmed) {
    throw new Error('Missing SQL query.');
  }
  if (trimmed.length > MAX_SQL_LENGTH) {
    throw new Error(
      `SQL query is too long. Maximum length is ${MAX_SQL_LENGTH} characters.`
    );
  }
  return trimmed;
}

const READONLY_START_KEYWORDS = new Set([
  'select',
  'show',
  'explain',
  'describe',
]);

const WRITE_KEYWORDS =
  /\b(alter|analyze|call|comment|copy|create|delete|drop|execute|grant|insert|merge|reindex|replace|revoke|set|truncate|update|vacuum)\b/i;

export function assertReadonlySql(sql: string, role: DatabaseRole): boolean {
  if (role !== 'readonly') {
    return true;
  }

  const normalized = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim();
  const firstKeyword = normalized.match(/^[a-z]+/i)?.[0]?.toLowerCase();

  if (!firstKeyword || !READONLY_START_KEYWORDS.has(firstKeyword)) {
    output.error(
      'Readonly database queries must start with SELECT, SHOW, EXPLAIN, or DESCRIBE.'
    );
    return false;
  }

  if (WRITE_KEYWORDS.test(normalized)) {
    output.error('Readonly database queries cannot contain write operations.');
    return false;
  }

  return true;
}

export function assertSessionTtl(ttl: string | undefined): boolean {
  if (!ttl) {
    return true;
  }

  const match = ttl.match(/^(\d+)([smh])$/);
  if (!match) {
    output.error('Invalid TTL. Use a duration like 30s, 15m, or 1h.');
    return false;
  }

  const value = Number(match[1]);
  const unit = match[2];
  const seconds =
    unit === 'h' ? value * 3600 : unit === 'm' ? value * 60 : value;

  if (seconds < 30 || seconds > 3600) {
    output.error('Database shell TTL must be between 30 seconds and 1 hour.');
    return false;
  }

  return true;
}
