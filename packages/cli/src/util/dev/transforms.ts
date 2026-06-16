import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'http';
import url from 'url';
import type { HeaderQueryTransform, Transform } from '@vercel/routing-utils';
import { parseQueryString, formatQueryString } from './parse-query-string';

export type { Transform };
type TargetTransform = HeaderQueryTransform;
type KeyRule = TargetTransform['target']['key'];

type TransformValue = string | string[] | number | undefined;
type TransformData = Record<string, TransformValue>;

export interface TransformContext {
  match: string[];
  keys: string[];
  env?: { [key: string]: string | undefined };
}

/**
 * Resolve transform against a route's capture groups and env,
 * returning transforms whose values are now literals.
 */
export function resolveTransforms(
  transforms: Transform[] | undefined,
  ctx: TransformContext
): Transform[] {
  if (!transforms || transforms.length === 0) {
    return [];
  }
  return transforms.map(transform => {
    if (transform.type === 'request.path') {
      return {
        ...transform,
        args: resolveString(transform.args, transform, ctx),
      };
    }
    return {
      ...transform,
      target: { key: resolveKey(transform.target.key, transform, ctx) },
      args: resolveArgs(transform.args, transform, ctx),
    };
  });
}

/** Apply response transforms. */
export function applyResponseTransforms(
  headers: OutgoingHttpHeaders,
  transforms: Transform[]
): void {
  for (const transform of transforms) {
    if (transform.type === 'response.headers' && 'target' in transform) {
      applyTransform(headers, transform, true);
    }
  }
}

/** Apply request-side transforms. */
export function applyRequestTransforms(
  req: { url?: string; headers: IncomingHttpHeaders },
  transforms: Transform[]
): void {
  if (transforms.length === 0) {
    return;
  }

  applyRequestHeaderTransforms(req.headers, transforms);

  const parsed = url.parse(req.url || '/');
  const query = parseQueryString(parsed.search);
  applyQueryTransforms(query, transforms);

  const newPath = getRequestPath(transforms);
  if (newPath !== undefined) {
    parsed.pathname = newPath;
  }
  parsed.search = formatQueryString(query);
  req.url = url.format(parsed);
}

/** Whether any transform rules to be applied for responses. */
export function hasResponseTransforms(transforms: Transform[]): boolean {
  return transforms.some(t => t.type === 'response.headers');
}

function resolveKey(
  key: KeyRule,
  _transform: Transform,
  ctx: TransformContext
) {
  if (typeof key === 'string') {
    return expandCaptureGroups(key, ctx.match, ctx.keys);
  }
  return key;
}

function resolveArgs(
  args: string | string[] | undefined,
  transform: Transform,
  ctx: TransformContext
): string | string[] | undefined {
  if (typeof args === 'string') {
    return resolveString(args, transform, ctx);
  }
  if (Array.isArray(args)) {
    return args.map(a =>
      typeof a === 'string' ? resolveString(a, transform, ctx) : a
    );
  }
  return args;
}

function resolveString(
  value: string,
  transform: Transform,
  ctx: TransformContext
): string {
  let resolved = expandCaptureGroups(value, ctx.match, ctx.keys);
  if (transform.env && transform.env.length > 0 && ctx.env) {
    resolved = expandEnvVars(resolved, transform.env, ctx.env);
  }
  return resolved;
}

// similar to router.ts:resolveRouteParameters,
// but replaces only known groups and leaves the rest in place
// for the future env vars replacement for transform rules
function expandCaptureGroups(
  str: string,
  match: string[],
  keys: string[]
): string {
  return str.replace(/\$([0-9A-Za-z_]+)/g, (whole, name: string) => {
    const namedIdx = keys.indexOf(name);
    if (namedIdx !== -1) {
      return match[namedIdx + 1] ?? '';
    }
    if (/^[0-9]+$/.test(name)) {
      const n = parseInt(name, 10);
      if (n < match.length) {
        return match[n] ?? '';
      }
    }
    return whole;
  });
}

function expandEnvVars(
  str: string,
  allowlist: string[],
  env: { [key: string]: string | undefined }
): string {
  const allowed = new Set(allowlist);
  return str.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match, braced, bare) => {
      const name = braced ?? bare;
      if (!allowed.has(name) || env[name] === undefined) {
        return match;
      }
      return env[name] as string;
    }
  );
}

function applyRequestHeaderTransforms(
  headers: IncomingHttpHeaders,
  transforms: Transform[]
): void {
  for (const transform of transforms) {
    if (transform.type === 'request.headers' && 'target' in transform) {
      applyTransform(headers, transform, true);
    }
  }
}

function applyQueryTransforms(
  query: Record<string, string[]>,
  transforms: Transform[]
): void {
  for (const transform of transforms) {
    if (transform.type === 'request.query' && 'target' in transform) {
      applyTransform(query, transform, false);
    }
  }
  for (const key of Object.keys(query)) {
    const value = query[key];
    if (value === undefined) {
      delete query[key];
    } else if (typeof value === 'string') {
      query[key] = [value];
    }
  }
}

function applyTransform(
  data: TransformData,
  transform: TargetTransform,
  isHeader: boolean
) {
  const keySelector = transform.target?.key;
  if (keySelector == null) {
    return;
  }
  const matchedKeys = findMatchingKeys(data, keySelector);
  switch (transform.op) {
    case 'set':
      opSet(data, matchedKeys, keySelector, transform.args);
      break;
    case 'append':
      opAppend(data, matchedKeys, keySelector, transform.args, isHeader);
      break;
    case 'delete':
      opDelete(data, matchedKeys, transform.args, isHeader);
      break;
    default:
      break;
  }
}

function getRequestPath(transforms: Transform[]): string | undefined {
  let path: string | undefined;
  for (const transform of transforms) {
    if (
      transform.type === 'request.path' &&
      transform.op === 'set' &&
      typeof transform.args === 'string'
    ) {
      path = transform.args;
    }
  }
  return path;
}

function findMatchingKeys(data: TransformData, keyPattern: KeyRule): string[] {
  const matched: string[] = [];
  for (const key of Object.keys(data)) {
    if (matchesRule(key, keyPattern)) {
      matched.push(key);
    }
  }
  return matched;
}

function matchesRule(candidate: string, rule: KeyRule): boolean {
  candidate = candidate.toLowerCase();

  if (rule == null) {
    return true;
  }

  if (typeof rule === 'string') {
    return candidate === rule.toLowerCase();
  }

  const r = rule as Record<string, unknown>;
  for (const [op, val] of Object.entries(r)) {
    if (val === undefined) {
      continue;
    }
    switch (op) {
      case 'eq':
        if (candidate !== String(val as string | number).toLowerCase())
          return false;
        break;
      case 'neq':
        if (candidate === (val as string).toLowerCase()) return false;
        break;
      case 'inc':
        if (!(val as string[]).some(v => candidate === v.toLowerCase()))
          return false;
        break;
      case 'ninc':
        if ((val as string[]).some(v => candidate === v.toLowerCase()))
          return false;
        break;
      case 'pre':
        if (!candidate.startsWith(String(val).toLowerCase())) return false;
        break;
      case 'suf':
        if (!candidate.endsWith(String(val).toLowerCase())) return false;
        break;
      case 'sub':
        if (!candidate.includes(String(val).toLowerCase())) return false;
        break;
      case 'gt':
        if (!(Number(candidate) > (val as number))) return false;
        break;
      case 'gte':
        if (!(Number(candidate) >= (val as number))) return false;
        break;
      case 'lt':
        if (!(Number(candidate) < (val as number))) return false;
        break;
      case 'lte':
        if (!(Number(candidate) <= (val as number))) return false;
        break;
      default:
        break;
    }
  }
  return true;
}

function opSet(
  data: TransformData,
  matchedKeys: string[],
  keySelector: KeyRule,
  args: string | string[] | undefined
) {
  for (const key of matchedKeys) {
    data[key] = args;
  }

  // create new key from the selector if it's a simple string and no matched keys
  if (
    matchedKeys.length === 0 &&
    typeof keySelector === 'string' &&
    data[keySelector] === undefined &&
    !isEmptyArgs(args)
  ) {
    data[keySelector] = args;
  }
}

function opAppend(
  data: TransformData,
  matchedKeys: string[],
  keySelector: KeyRule,
  args: string | string[] | undefined,
  isHeader: boolean
) {
  if (isEmptyArgs(args)) {
    return;
  }
  const toAppend = typeof args === 'string' ? [args] : (args ?? []);

  for (const key of matchedKeys) {
    const next = [...toValueList(data[key], isHeader), ...toAppend];
    setTransformValue(data, key, fromValueList(next));
  }

  // create new key if nothing matched as key selector is a simple string
  if (matchedKeys.length === 0 && typeof keySelector === 'string') {
    setTransformValue(data, keySelector, fromValueList(toAppend));
  }
}

function opDelete(
  data: TransformData,
  matchedKeys: string[],
  args: string | string[] | undefined,
  isHeader: boolean
) {
  if (args == null) {
    for (const key of matchedKeys) {
      delete data[key];
    }
    return;
  }

  const patterns = typeof args === 'string' ? [args] : args;
  for (const key of matchedKeys) {
    const kept = toValueList(data[key], isHeader).filter(
      value => !patterns.some(pattern => matchesRule(value, pattern))
    );
    setTransformValue(data, key, fromValueList(kept));
  }
}

function toValueList(value: TransformValue, isHeader: boolean): string[] {
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  const str = String(value);
  // headers could be comma-separated, so split + trim
  if (isHeader && str.includes(',')) {
    return str
      .split(',')
      .map(v => v.trim())
      .filter(v => v !== '');
  }
  return [str];
}

function fromValueList(values: string[]): TransformValue {
  if (values.length === 0) {
    return undefined;
  }
  if (values.length === 1) {
    return values[0];
  }
  return values;
}

function setTransformValue(
  data: TransformData,
  key: string,
  value: TransformValue
) {
  if (value === undefined) {
    delete data[key];
  } else {
    data[key] = value;
  }
}

function isEmptyArgs(args: string | string[] | undefined): boolean {
  if (args == null) return true;
  if (typeof args === 'string') return args === '';
  return args.length === 0;
}
