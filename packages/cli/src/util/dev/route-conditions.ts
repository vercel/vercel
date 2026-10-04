import type { IncomingHttpHeaders } from 'http';
import type { HasField } from '@vercel/routing-utils';

/**
 * Request data that `has` / `missing` route conditions are evaluated against.
 * `query` is parsed from the URL currently being routed (see `devRouter`).
 */
export interface RouteConditionContext {
  headers: IncomingHttpHeaders;
  query: Record<string, string[]>;
}

export interface ConditionMatch {
  matched: boolean;
  /**
   * Values captured while matching, usable as `$name` substitutions in
   * `dest` and `headers`. Contains named regex groups from `value`
   * patterns, bare `key` values (e.g. `$id` for `{ type: 'query', key: 'id' }`)
   * and `$host` for `host` conditions with a string (or `re`) value.
   * Mirrors `collectHasSegments` in `@vercel/routing-utils`.
   */
  params: Record<string, string>;
}

interface ValueMatchers {
  eq?: string | number;
  neq?: string;
  inc?: string[];
  ninc?: string[];
  pre?: string;
  suf?: string;
  re?: string;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
}

type Condition = HasField[number];

function getHeaderValue(
  headers: IncomingHttpHeaders,
  name: string
): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value.join(name === 'cookie' ? '; ' : ', ');
  }
  return value;
}

export function parseCookieHeader(
  header: string | undefined
): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) {
    return cookies;
  }
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (!name || name in cookies) continue;
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
      value = value.slice(1, -1);
    }
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

function getRequestHost(headers: IncomingHttpHeaders): string | undefined {
  const host = getHeaderValue(headers, 'host');
  if (host === undefined) {
    return undefined;
  }
  // Strip a trailing `:port` so `value: 'example.com'` matches
  // `example.com:3000` in local development.
  return host.replace(/:\d+$/, '');
}

function lookupCondition(
  condition: Condition,
  ctx: RouteConditionContext,
  cookies: Record<string, string>
): { exists: boolean; actual: string | undefined } {
  switch (condition.type) {
    case 'header': {
      const actual = getHeaderValue(ctx.headers, condition.key);
      return { exists: actual !== undefined, actual };
    }
    case 'cookie': {
      const actual = cookies[condition.key];
      return { exists: actual !== undefined, actual };
    }
    case 'query': {
      const exists = Object.prototype.hasOwnProperty.call(
        ctx.query,
        condition.key
      );
      const actual = exists ? (ctx.query[condition.key][0] ?? '') : undefined;
      return { exists, actual };
    }
    case 'host': {
      const actual = getRequestHost(ctx.headers);
      return { exists: actual !== undefined, actual };
    }
  }
}

function matchRegex(
  actual: string,
  pattern: string
): { matched: boolean; captures: Record<string, string> } {
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return { matched: false, captures: {} };
  }
  const match = re.exec(actual);
  if (!match) {
    return { matched: false, captures: {} };
  }
  const captures: Record<string, string> = {};
  for (const [name, value] of Object.entries(match.groups ?? {})) {
    if (value !== undefined) {
      captures[name] = value;
    }
  }
  return { matched: true, captures };
}

function matchNumeric(actual: string, expected: number): number | null {
  if (actual.trim() === '') {
    return null;
  }
  const num = Number(actual);
  if (!Number.isFinite(num)) {
    return null;
  }
  return num - expected;
}

function matchConditionValue(
  actual: string,
  value: string | ValueMatchers
): { matched: boolean; captures: Record<string, string> } {
  if (typeof value === 'string') {
    return matchRegex(actual, value);
  }
  let captures: Record<string, string> = {};
  if (value.eq !== undefined && String(actual) !== String(value.eq)) {
    return { matched: false, captures: {} };
  }
  if (value.neq !== undefined && actual === value.neq) {
    return { matched: false, captures: {} };
  }
  if (
    value.inc !== undefined &&
    !value.inc.some(item => actual.includes(item))
  ) {
    return { matched: false, captures: {} };
  }
  if (
    value.ninc !== undefined &&
    value.ninc.some(item => actual.includes(item))
  ) {
    return { matched: false, captures: {} };
  }
  if (value.pre !== undefined && !actual.startsWith(value.pre)) {
    return { matched: false, captures: {} };
  }
  if (value.suf !== undefined && !actual.endsWith(value.suf)) {
    return { matched: false, captures: {} };
  }
  if (value.re !== undefined) {
    const reMatch = matchRegex(actual, value.re);
    if (!reMatch.matched) {
      return { matched: false, captures: {} };
    }
    captures = reMatch.captures;
  }
  if (value.gt !== undefined) {
    const diff = matchNumeric(actual, value.gt);
    if (diff === null || diff <= 0) return { matched: false, captures: {} };
  }
  if (value.gte !== undefined) {
    const diff = matchNumeric(actual, value.gte);
    if (diff === null || diff < 0) return { matched: false, captures: {} };
  }
  if (value.lt !== undefined) {
    const diff = matchNumeric(actual, value.lt);
    if (diff === null || diff >= 0) return { matched: false, captures: {} };
  }
  if (value.lte !== undefined) {
    const diff = matchNumeric(actual, value.lte);
    if (diff === null || diff > 0) return { matched: false, captures: {} };
  }
  return { matched: true, captures };
}

/**
 * Evaluates the `has` (all must match) and `missing` (none must match)
 * conditions of a route against the incoming request.
 */
export function matchRouteConditions(
  has: HasField | undefined,
  missing: HasField | undefined,
  ctx: RouteConditionContext
): ConditionMatch {
  const params: Record<string, string> = {};
  const cookies = parseCookieHeader(getHeaderValue(ctx.headers, 'cookie'));

  for (const condition of has ?? []) {
    const { exists, actual } = lookupCondition(condition, ctx, cookies);
    if (condition.value === undefined) {
      if (!exists) {
        return { matched: false, params: {} };
      }
      if ('key' in condition) {
        params[condition.key] = actual ?? '';
      }
      continue;
    }
    if (actual === undefined) {
      return { matched: false, params: {} };
    }
    const valueMatch = matchConditionValue(
      actual,
      condition.value as string | ValueMatchers
    );
    if (!valueMatch.matched) {
      return { matched: false, params: {} };
    }
    Object.assign(params, valueMatch.captures);
    if (
      condition.type === 'host' &&
      (typeof condition.value === 'string' ||
        typeof (condition.value as ValueMatchers).re === 'string')
    ) {
      params.host = actual;
    }
  }

  for (const condition of missing ?? []) {
    const { exists, actual } = lookupCondition(condition, ctx, cookies);
    if (condition.value === undefined) {
      if (exists) {
        return { matched: false, params: {} };
      }
      continue;
    }
    if (
      actual !== undefined &&
      matchConditionValue(actual, condition.value as string | ValueMatchers)
        .matched
    ) {
      return { matched: false, params: {} };
    }
  }

  return { matched: true, params };
}
